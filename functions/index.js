// Import V2 modules
const {
  onObjectFinalized,
  onObjectDeleted,
} = require("firebase-functions/v2/storage");
const {
  onDocumentWritten,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");
const {
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { defineString } = require("firebase-functions/params");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { getStorage } = require("firebase-admin/storage");

admin.initializeApp();
const db = admin.firestore();
const storage = getStorage();

const cryptoSecret = defineString("CRYPTO_SECRET");

/**
 * [V2 Storage Trigger]
 * Triggered when a new file is uploaded. Increments the band's storage usage.
 */
exports.onFileUpload = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name;
  const fileSize = parseInt(object.size, 10);

  if (!filePath.startsWith("bands/")) {
    logger.log(`Not a band file, skipping: ${filePath}`);
    return null;
  }

  const pathParts = filePath.split("/");
  const bandId = pathParts[1];
  const bandRef = db.collection("bands").doc(bandId);

  try {
    await bandRef.update({
      storageUsed: admin.firestore.FieldValue.increment(fileSize),
    });
    logger.log(`Incremented storage for band ${bandId} by ${fileSize} bytes.`);
  } catch (error) {
    logger.error(`Failed to increment storage for band ${bandId}:`, error);
  }
  return null;
});

/**
 * [V2 Storage Trigger]
 * Triggered when a file is deleted. Decrements the band's storage usage.
 */
exports.onFileDelete = onObjectDeleted(async (event) => {
  const object = event.data;
  const filePath = object.name;
  const fileSize = parseInt(object.size, 10);

  if (!filePath.startsWith("bands/")) {
    logger.log(`Not a band file, skipping: ${filePath}`);
    return null;
  }

  const pathParts = filePath.split("/");
  const bandId = pathParts[1];
  const bandRef = db.collection("bands").doc(bandId);

  try {
    await bandRef.update({
      storageUsed: admin.firestore.FieldValue.increment(-fileSize),
    });
    logger.log(`Decremented storage for band ${bandId} by ${fileSize} bytes.`);
  } catch (error) {
    logger.error(`Failed to decrement storage for band ${bandId}:`, error);
  }
  return null;
});

/**
 * [V2 Firestore Trigger]
 * Triggers when a member document is written. Updates user's custom claims.
 */
exports.onUserRoleChange = onDocumentWritten(
  "bands/{bandId}/members/{userId}",
  async (event) => {
    const { userId, bandId } = event.params;
    const change = event.data;
    const newRole = change.after.exists ? change.after.data().role : null;

    try {
      const user = await admin.auth().getUser(userId);
      const currentClaims = user.customClaims || {};
      const userBands = currentClaims.bands || {};

      if (newRole) {
        userBands[bandId] = newRole;
      } else {
        delete userBands[bandId];
      }

      await admin
        .auth()
        .setCustomUserClaims(userId, { ...currentClaims, bands: userBands });
      logger.log(
        `Successfully set claims for user ${userId} in band ${bandId} to ${newRole}`
      );
    } catch (error) {
      logger.error("Error setting custom claims:", error);
    }
  }
);

/**
 * [V2 Callable Function]
 * Creates a custom auth token with specific claims for a selected band.
 */
exports.getScopedAuthToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }
  const userId = request.auth.uid;
  const bandId = request.data.bandId;
  if (!bandId) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a 'bandId'."
    );
  }

  try {
    const memberDocPromise = db
      .collection("bands")
      .doc(bandId)
      .collection("members")
      .doc(userId)
      .get();
    const bandDocPromise = db.collection("bands").doc(bandId).get();
    const [memberDoc, bandDoc] = await Promise.all([
      memberDocPromise,
      bandDocPromise,
    ]);

    if (!memberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "User is not a member of this band."
      );
    }
    if (!bandDoc.exists) {
      throw new HttpsError("not-found", "Band document could not be found.");
    }

    const role = memberDoc.data().role;
    const bandData = bandDoc.data();

    const customToken = await admin.auth().createCustomToken(userId, {
      bandRole: role,
      activeBandId: bandId,
      storageUsed: bandData.storageUsed || 0,
      storageQuota: bandData.storageQuota || 524288000, // Default 500 MB
    });

    return { token: customToken };
  } catch (error) {
    logger.error("Error creating custom token:", error);
    throw new HttpsError("internal", "Could not create token.");
  }
});

/**
 * [Helper Function]
 * Recursively sanitizes an object to make it JSON-serializable.
 * Converts Timestamps to numbers and removes FieldValue objects.
 */
function makeJsonSafe(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (typeof obj.toMillis === "function") {
    return obj.toMillis();
  }

  if (Array.isArray(obj)) {
    return obj.map(makeJsonSafe);
  }

  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key];
    if (
      value !== null &&
      typeof value === "object" &&
      value.constructor.name !== "Object" &&
      value.constructor.name !== "Array" &&
      !value.toMillis
    ) {
      return acc;
    }
    acc[key] = makeJsonSafe(value);
    return acc;
  }, {});
}

/**
 * [V2 Callable Function]
 * Generates a secure, signed data packet for offline use.
 */
exports.generateSignedOfflineData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = request.auth.uid;
  const { bandId } = request.data;

  if (!bandId) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a 'bandId'."
    );
  }

  const secret = cryptoSecret.value();
  if (!secret) {
    logger.error(
      "CRITICAL: HMAC secret key is not configured. Ensure CRYPTO_SECRET is set in your .env file."
    );
    throw new HttpsError("internal", "Server configuration error.");
  }

  logger.info(
    `[Offline Data] Starting generation for band: ${bandId}, user: ${userId}`
  );

  try {
    const bandRef = db.collection("bands").doc(bandId);
    const [bandDoc, userDoc, membersSnapshot] = await Promise.all([
      bandRef.get(),
      db.collection("users").doc(userId).get(),
      bandRef.collection("members").get(),
    ]);

    if (!bandDoc.exists || !userDoc.exists) {
      throw new HttpsError("not-found", "Band or user data not found.");
    }

    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const expirationTimestamp = Date.now() + TEN_DAYS_MS;
    const reversedTimestamp = String(expirationTimestamp)
      .split("")
      .reverse()
      .join("");
    const encodedExpiration = Buffer.from(reversedTimestamp, "utf8").toString(
      "base64"
    );

    const payload = {
      bandData: { id: bandDoc.id, ...bandDoc.data() },
      userData: userDoc.data(),
      members: membersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
      expiration: encodedExpiration,
    };

    const sanitizedPayload = makeJsonSafe(payload);
    const payloadString = JSON.stringify(sanitizedPayload);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");

    return { payload: payloadString, signature };
  } catch (error) {
    logger.error(
      `[Offline Data] CRITICAL FAILURE during generation for band ${bandId}:`,
      error
    );
    throw new HttpsError(
      "internal",
      error.message || "Could not generate offline data."
    );
  }
});

/**
 * [V2 Firestore Trigger]
 * Maintains band leadership when a member is deleted.
 * Promotes the next available member to Leader if no leaders remain.
 * Deletes the band if no members remain.
 */
exports.maintainBandLeadership = onDocumentDeleted(
  "bands/{bandId}/members/{memberId}",
  async (event) => {
    const { bandId, memberId } = event.params;
    const deletedMember = event.data.data();
    const bandRef = db.collection("bands").doc(bandId);
    const membersRef = bandRef.collection("members");

    if (deletedMember.role !== "Leader") {
      logger.log(
        `Member ${memberId} was not a leader. No leadership action needed.`
      );
      return null;
    }

    const leadersSnapshot = await membersRef
      .where("role", "==", "Leader")
      .get();
    if (!leadersSnapshot.empty) {
      logger.log(
        `Band ${bandId} still has leaders. No leadership action needed.`
      );
      return null;
    }

    const membersSnapshot = await membersRef
      .where("role", "==", "Member")
      .orderBy("joinedAt", "asc")
      .limit(1)
      .get();
    if (!membersSnapshot.empty) {
      const newLeader = membersSnapshot.docs[0];
      logger.log(
        `Promoting member ${newLeader.id} to Leader in band ${bandId}.`
      );
      return newLeader.ref.update({ role: "Leader" });
    } else {
      logger.log(`Band ${bandId} has no members left. Deleting band.`);
      return bandRef.delete();
    }
  }
);

/**
 * [V2 Firestore Trigger]
 * When a band is deleted, cleans up associated files from Cloud Storage.
 */
exports.onBandDeleted = onDocumentDeleted("bands/{bandId}", async (event) => {
  const { bandId } = event.params;

  const bucket = storage.bucket();
  const directory = `bands/${bandId}/`;

  try {
    await bucket.deleteFiles({ prefix: directory });
    logger.log(`Successfully deleted storage for band ${bandId}.`);
  } catch (error) {
    logger.error(`Error cleaning up storage for band ${bandId}:`, error);
  }

  return null;
});

/**
 * [V2 Callable Function]
 * Allows a member to claim ownership of a locked band.
 */
exports.claimBandOwnership = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Must be logged in to claim a band."
    );
  }

  const { bandId } = request.data;
  const userId = request.auth.uid;

  if (!bandId) {
    throw new HttpsError("invalid-argument", "Band ID is required.");
  }

  const bandRef = db.collection("bands").doc(bandId);
  const bandDoc = await bandRef.get();

  if (!bandDoc.exists) {
    throw new HttpsError("not-found", "Band not found.");
  }

  const bandData = bandDoc.data();

  if (!bandData.locked) {
    throw new HttpsError("failed-precondition", "This band is not locked.");
  }

  const memberRef = bandRef.collection("members").doc(userId);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "You must be a member of this band to claim it."
    );
  }

  const batch = db.batch();

  batch.update(bandRef, {
    ownerId: userId,
    locked: false,
  });

  batch.update(memberRef, { role: "Leader" });

  await batch.commit();

  return { success: true };
});
