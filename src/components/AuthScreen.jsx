import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { RetroMicIcon } from '../helpers/Icons';

const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
        errors.push("at least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("an uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("a lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("a number");
    }
    return errors;
};

function AuthScreen({ auth, db, error, setError, onEnterOfflineMode, offlineBandName }) {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [passwordErrors, setPasswordErrors] = useState([]);
    const [isPasswordFocused, setIsPasswordFocused] = useState(false);

    // --- Handle password changes in real-time ---
    const handlePasswordChange = (e) => {
        const newPassword = e.target.value;
        setPassword(newPassword);
        if (mode === 'signup') {
            setPasswordErrors(validatePassword(newPassword));
        }
    };

    const handleAuthAction = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        // --- NEW: Prevent submission if password is invalid ---
        if (mode === 'signup') {
            const validationErrors = validatePassword(password);
            if (validationErrors.length > 0) {
                setPasswordErrors(validationErrors);
                setError(`Your password must contain: ${validationErrors.join(', ')}.`);
                return; // Stop the function here
            }
        }
        
        try {
            if (mode === 'signup') {
                if (!name) { setError("Please enter your name."); return; }
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await sendEmailVerification(userCredential.user);
                await setDoc(doc(db, "users", userCredential.user.uid), { name: name, bandIds: [], ownedBandCount: 0 });
                setMessage('Verification email sent! Please check your inbox to activate your account.');
                setMode('login');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            console.error("Authentication Error Code:", err.code);
            switch (err.code) {
                case 'auth/invalid-credential':
                    setError("The email or password you entered is incorrect. Please try again.");
                    break;
                case 'auth/user-not-found':
                    setError("The email or password you entered is incorrect. Please try again.");
                    break;
                case 'auth/wrong-password':
                    setError("The email or password you entered is incorrect. Please try again.");
                    break;
                case 'auth/email-already-in-use':
                    setError("An account with this email address already exists.");
                    break;
                case 'auth/weak-password':
                    setError("Your password must be at least 8 characters long.");
                    break;
                case 'auth/too-many-requests':
                    setError("Access to this account has been temporarily disabled. Please reset your password or try again later.");
                    break;
                default:
                    setError("An unexpected error occurred. Please try again.");
                    break;
            }
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        if (!email) {
            setError('Please enter your email address to reset your password.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage('Password reset email sent! Check your inbox.');
            setMode('login');
        } catch (err) {
            setError(err.message);
        }
    };

    const handleGoogleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
                // If the user is new, create a document for them
                await setDoc(userDocRef, {
                    email: user.email,
                    name: user.displayName || 'New User', // Use Google display name or a default
                    createdDate: serverTimestamp(),
                    bandIds: [],
                    ownedBandCount: 0
                });
            }
            // Authentication state change will handle the rest
        } catch (error) {
            setError(error.message);
        }
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md text-center">
                <h1 className="text-4xl font-bold text-sky-400 mb-2">SetlistSync</h1>
                <p className="text-gray-400 mb-8">
                    {mode === 'login' ? 'Sign in to continue' : mode === 'signup' ? 'Create an account' : 'Reset your password'}
                </p>
                {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-6">{error}</p>}
                {message && <p className="bg-green-900 text-green-300 p-3 rounded-md mb-6">{message}</p>}

                <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
                    {mode === 'reset' ? (
                    <form onSubmit={handlePasswordReset} className="space-y-4 text-left">
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" className="w-full bg-gray-700 p-3 rounded-md" required />
                        <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition duration-300">Send Reset Link</button>
                    </form>
                ) : (
                    <form onSubmit={handleAuthAction} className="space-y-4 text-left">
                        {mode === 'signup' && ( <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" className="w-full bg-gray-700 p-3 rounded-md" required /> )}
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" className="w-full bg-gray-700 p-3 rounded-md" required />
                        <input
                            type="password"
                            value={password}
                            onChange={handlePasswordChange}
                            onFocus={() => setIsPasswordFocused(true)}
                            onBlur={() => setIsPasswordFocused(false)}
                            placeholder="Password"
                            className="w-full bg-gray-700 p-3 rounded-md"
                            required
                        />
                        {mode === 'signup' && isPasswordFocused && passwordErrors.length > 0 && (
                            <div className="text-xs text-yellow-400 p-2 bg-gray-900/50 rounded-md">
                                <p>Password must contain:</p>
                                <ul className="list-disc list-inside ml-2">
                                    {passwordErrors.map(err => <li key={err}>{err}</li>)}
                                </ul>
                            </div>
                        )}
                        <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition duration-300">{mode === 'login' ? 'Log In' : 'Sign Up'}</button>
                    </form>
                )}

                {mode === 'login' && (
                    <>
                        <div className="relative flex py-5 items-center">
                            <div className="flex-grow border-t border-gray-400"></div>
                            <span className="flex-shrink mx-4 text-gray-400">or</span>
                            <div className="flex-grow border-t border-gray-400"></div>
                        </div>
                        <button onClick={handleGoogleSignIn} type="button" className="w-full flex justify-center items-center bg-white text-black font-semibold py-2 px-4 rounded-md hover:bg-gray-200 transition-colors">
                            <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                            Sign in with Google
                        </button>
                    </>
                )}

                {mode === 'login' && (
                    <div className="flex justify-between items-center mt-4">
                        <button onClick={() => setMode('reset')} className="text-sm text-sky-400 hover:underline">Forgot Password?</button>
                        <button onClick={() => { setMode('signup'); setError(''); setMessage(''); }} className="text-sm text-sky-400 hover:underline">Don't have an account? Sign Up</button>
                    </div>
                )}
                 {mode !== 'login' && (
                    <button onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="mt-4 text-sky-400 hover:underline">Back to Log In</button>
                 )}
                </div>
            </div>

            {offlineBandName && (
                <div className="w-full max-w-md text-center mt-8">
                    <div className="flex items-center justify-center">
                        <div className="flex-grow border-t border-gray-600"></div>
                        <span className="flex-shrink mx-4 text-gray-400">Or</span>
                        <div className="flex-grow border-t border-gray-600"></div>
                    </div>
                    <button
                        onClick={onEnterOfflineMode}
                        className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                    >
                        Enter Offline Mode for "{offlineBandName}"
                    </button>
                </div>
            )}
        </div>
    );
}

export default AuthScreen;