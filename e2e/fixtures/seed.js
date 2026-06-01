/**
 * Seed script for the Firebase Emulator Suite.
 * Run this before E2E tests to populate Auth + Firestore with fixture data.
 *
 * Usage: node e2e/fixtures/seed.js
 *
 * Requires the emulators to be running:
 *   firebase emulators:start --only auth,firestore,storage,functions
 */

import { initializeApp } from 'firebase/app';
import {
    getAuth,
    connectAuthEmulator,
    createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
    getFirestore,
    connectFirestoreEmulator,
    doc,
    setDoc,
    collection,
    addDoc,
    serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'demo-key',
    authDomain: 'demo-project.firebaseapp.com',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099');
connectFirestoreEmulator(db, '127.0.0.1', 8080);

export const FIXTURES = {
    leader: { email: 'leader@test.com', password: 'TestPass123!', uid: null },
    member: { email: 'member@test.com', password: 'TestPass123!', uid: null },
    bandId: null,
};

async function seed() {
    console.log('Seeding emulator...');

    // Create users
    const leaderCred = await createUserWithEmailAndPassword(
        auth,
        FIXTURES.leader.email,
        FIXTURES.leader.password
    );
    FIXTURES.leader.uid = leaderCred.user.uid;

    const memberCred = await createUserWithEmailAndPassword(
        auth,
        FIXTURES.member.email,
        FIXTURES.member.password
    );
    FIXTURES.member.uid = memberCred.user.uid;

    // User profiles
    await setDoc(doc(db, 'users', FIXTURES.leader.uid), {
        displayName: 'Test Leader',
        email: FIXTURES.leader.email,
    });
    await setDoc(doc(db, 'users', FIXTURES.member.uid), {
        displayName: 'Test Member',
        email: FIXTURES.member.email,
    });

    // Band
    const bandRef = await addDoc(collection(db, 'bands'), {
        name: 'Test Band',
        ownerId: FIXTURES.leader.uid,
        inviteCode: 'TESTCODE',
        storageUsed: 0,
        storageQuota: 524288000,
        locked: false,
        createdAt: serverTimestamp(),
    });
    FIXTURES.bandId = bandRef.id;

    // Band members
    await setDoc(
        doc(db, 'bands', FIXTURES.bandId, 'members', FIXTURES.leader.uid),
        { role: 'Leader', displayName: 'Test Leader', joinedAt: serverTimestamp() }
    );
    await setDoc(
        doc(db, 'bands', FIXTURES.bandId, 'members', FIXTURES.member.uid),
        { role: 'Member', displayName: 'Test Member', joinedAt: serverTimestamp() }
    );

    // Songs
    const songsRef = collection(db, 'bands', FIXTURES.bandId, 'songs');
    await addDoc(songsRef, {
        title: 'First Song',
        artist: 'Test Artist',
        key: 'A',
        lyricsChords: '<p>Verse one lyrics</p>',
        createdAt: serverTimestamp(),
    });
    await addDoc(songsRef, {
        title: 'Second Song',
        artist: 'Test Artist',
        key: 'G',
        lyricsChords: '',
        createdAt: serverTimestamp(),
    });

    // Setlist
    const setlistsRef = collection(db, 'bands', FIXTURES.bandId, 'setlists');
    await addDoc(setlistsRef, {
        name: 'Main Setlist',
        items: [],
        createdAt: serverTimestamp(),
    });

    console.log('Seed complete. Band ID:', FIXTURES.bandId);
}

seed().catch(console.error);
