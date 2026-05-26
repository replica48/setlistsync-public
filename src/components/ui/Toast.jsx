
const Toast = ({ message, type, onDismiss }) => {
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-green-600';
    return (
        <div className={`fixed bottom-4 right-4 z-[100] p-4 rounded-lg shadow-lg text-white ${bgColor} animate-fade-in-out`}>
            <span>{message}</span>
            <button onClick={onDismiss} className="ml-4 font-bold text-lg leading-none">&times;</button>
        </div>
    );
};

export default Toast;