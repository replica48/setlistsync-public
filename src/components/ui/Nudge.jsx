
export const NudgeOverlay = () => (
    <div className="fixed inset-0 bg-white z-50 animate-flash-in-out pointer-events-none"></div>
);
export const NudgeAlert = ({ nudgerName }) => (
    <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-sky-500/95 backdrop-blur-sm text-white text-center text-2xl font-bold p-8 rounded-lg shadow-2xl z-[100] animate-pulse">
        <p className="text-4xl mb-4">Hey!</p>
        <p>{nudgerName} needs your attention.</p>
    </div>
);