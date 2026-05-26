
const Modal = ({ children, onClose, size = 'lg', padding = 'p-6', zIndex = 'z-50' }) => (
    <div className={`fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center ${zIndex} p-4`}>
        <div className={`bg-gray-800 rounded-lg shadow-xl w-full max-h-full flex flex-col overflow-y-auto ${padding} relative ${
            size === 'lg' ? 'max-w-lg' :
            size === 'xl' ? 'max-w-4xl' :
            size === 'xxl' ? 'max-w-7xl' : 'max-w-lg'
        }`}>
            <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-3xl leading-none z-10">&times;</button>
            {children}
        </div>
    </div>
);

export default Modal;