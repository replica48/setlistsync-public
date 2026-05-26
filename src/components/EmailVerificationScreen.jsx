import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import Spinner from "./ui/Spinner";

function EmailVerificationScreen({ user, auth, handleSignOut }) {
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    const handleResend = async () => {
        setIsSending(true);
        setMessage('');
        setError('');
        try {
            await sendEmailVerification(user);
            setMessage('A new verification email has been sent. Please check your inbox (and spam folder).');
        } catch (err) {
            setError('Failed to send verification email. Please try again in a few minutes.');
            console.error(err);
        }
        setIsSending(false);
    };

    const handleCheckVerification = async () => {
        setIsChecking(true);
        setError('');
        setMessage('');
        if (auth.currentUser) {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
                window.location.reload();
            } else {
                setError("Your email has not been verified yet. Please click the link in your inbox.");
            }
        }
        setIsChecking(false);
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg text-center">
                <h1 className="text-3xl font-bold text-sky-400 mb-4">Verify Your Email</h1>
                <p className="text-gray-300 mb-6">A verification link has been sent to <strong>{user.email}</strong>. Please click the link in your inbox to continue.</p>
                {message && <p className="bg-green-900 text-green-300 p-3 rounded-md mb-4">{message}</p>}
                {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">{error}</p>}

                <div className="mt-6 space-y-3">
                     <button onClick={handleCheckVerification} disabled={isChecking} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center">
                        {isChecking && <Spinner />}
                        {isChecking ? 'Checking...' : 'Continue'}
                    </button>
                    <button onClick={handleResend} disabled={isSending} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed">
                        {isSending ? 'Sending...' : 'Resend Verification Email'}
                    </button>
                    <button onClick={handleSignOut} className="text-gray-400 hover:text-white py-2">Log Out</button>
                </div>
            </div>
        </div>
    );
}

export default EmailVerificationScreen;