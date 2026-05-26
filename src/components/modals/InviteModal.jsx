import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import Modal from "./Modal";
import Spinner from "../ui/Spinner";

function InviteModal({ bandData, db, user, onClose }) {
    const [inviteType, setInviteType] = useState('onetime');
    const [email, setEmail] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [maxUses, setMaxUses] = useState(1);
    const [expiresInDays, setExpiresInDays] = useState(7);

    const handleGenerate = async () => {
        setIsLoading(true);
        setError('');
        setGeneratedLink('');

        if (inviteType === 'email' && !email) {
            setError('Please enter an email address for the invite.');
            setIsLoading(false);
            return;
        }

        try {
            const expirationDate = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
            
            const inviteData = {
                bandId: bandData.id,
                bandName: bandData.name,
                type: inviteType,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                restrictedEmail: inviteType === 'email' ? email.trim().toLowerCase() : null,
                maxUses: inviteType === 'onetime' ? Number(maxUses) : 1,
                useCount: 0,
                expiresAt: inviteType === 'onetime' ? expirationDate : null,
                status: 'active'
            };

            const inviteRef = await addDoc(collection(db, "bandInvites"), inviteData);
            const baseUrl = window.location.origin;
            const link = `${baseUrl}?join_token=${inviteRef.id}`;
            setGeneratedLink(link);

        } catch (err) {
            console.error(err);
            setError('Failed to create invite link. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal onClose={onClose} size="lg">
            <h2 className="text-2xl font-bold mb-4">Invite Members to {bandData.name}</h2>
            {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">{error}</p>}
            
            {!generatedLink ? (
                <div>
                    <p className="text-gray-400 mb-4">Choose an invite type:</p>
                    <div className="space-y-3">
                        <label className="flex flex-col p-3 bg-gray-700 rounded-lg cursor-pointer">
                            <div className="flex items-center">
                                <input type="radio" name="inviteType" value="onetime" checked={inviteType === 'onetime'} onChange={() => setInviteType('onetime')} className="h-4 w-4 text-sky-600 bg-gray-900 border-gray-600 focus:ring-sky-500"/>
                                <span className="ml-3 text-white">
                                    <span className="font-semibold">General Invite Link</span>
                                    <span className="block text-sm text-gray-400">A shareable link with a custom use limit and expiration.</span>
                                </span>
                            </div>
                            {inviteType === 'onetime' && (
                                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-600">
                                    <div>
                                        <label htmlFor="max-uses" className="block text-sm font-medium text-gray-300 mb-1">Number of Uses</label>
                                        <input id="max-uses" type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-full bg-gray-900 p-2 rounded-md" />
                                    </div>
                                    <div>
                                        <label htmlFor="expires-in" className="block text-sm font-medium text-gray-300 mb-1">Expires in (days)</label>
                                        <input id="expires-in" type="number" min="1" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} className="w-full bg-gray-900 p-2 rounded-md" />
                                    </div>
                                </div>
                            )}
                        </label>
                        <label className="flex items-center p-3 bg-gray-700 rounded-lg cursor-pointer">
                            <input type="radio" name="inviteType" value="email" checked={inviteType === 'email'} onChange={() => setInviteType('email')} className="h-4 w-4 text-sky-600 bg-gray-900 border-gray-600 focus:ring-sky-500"/>
                             <span className="ml-3 text-white">
                                <span className="font-semibold">Email-Specific Invite</span>
                                <span className="block text-sm text-gray-400">A single-use link for a specific person.</span>
                            </span>
                        </label>
                    </div>

                    {inviteType === 'email' && (
                        <div className="mt-4">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Recipient's Email Address</label>
                            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-gray-900 p-2 rounded-md" required />
                        </div>
                    )}
                    
                    <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded" disabled={isLoading}>Cancel</button>
                        <button onClick={handleGenerate} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded flex items-center" disabled={isLoading}>
                            {isLoading && <Spinner/>}
                            {isLoading ? 'Generating...' : 'Generate Invite'}
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <p className="text-green-400 font-semibold mb-2">Invite Link Generated!</p>
                    <p className="text-gray-400 mb-4">Share this link with the person you want to invite.</p>
                    <div className="flex items-center gap-2">
                        <input type="text" readOnly value={generatedLink} className="w-full bg-gray-900 p-2 rounded-md text-gray-300" />
                        <button onClick={handleCopy} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded">
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                     <div className="flex justify-end gap-4 mt-6">
                        <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Done</button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

export default InviteModal;