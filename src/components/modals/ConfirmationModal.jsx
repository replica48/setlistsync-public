import Modal from './Modal.jsx'

const ConfirmationModal = ({ title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', confirmColor = 'bg-red-600' }) => {
    return (
        <Modal onClose={onCancel} size="lg" zIndex='z-60'>
            <h2 className="text-2xl text-gray-300 font-bold mb-4">{title}</h2>
            <p className="text-gray-300 mb-6">{message}</p>
            <div className="flex justify-end gap-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md"
                >
                    {cancelText}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className={`${confirmColor} hover:opacity-80 text-white font-bold py-2 px-6 rounded-md`}
                >
                    {confirmText}
                </button>
            </div>
        </Modal>
    );
};

export default ConfirmationModal;