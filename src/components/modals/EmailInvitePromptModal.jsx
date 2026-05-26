import Modal from "./Modal";

function EmailInvitePromptModal({ inviteData, onAccept, onDecline }) {
    return (
        <Modal onClose={onDecline} size="lg">
             <h2 className="text-2xl font-bold mb-4">You're Invited!</h2>
             <p className="text-gray-300 mb-6">You have been invited to join the band <strong className="text-sky-400">{inviteData.bandName}</strong>. Would you like to join now?</p>
             <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onDecline} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Maybe Later</button>
                <button type="button" onClick={onAccept} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded">Join Band</button>
             </div>
        </Modal>
    );
}

export default EmailInvitePromptModal;