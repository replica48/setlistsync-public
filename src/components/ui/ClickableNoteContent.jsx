
const ClickableNoteContent = ({ text }) => {
    // This regex finds URLs in the text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
        <p className="text-gray-300 whitespace-pre-wrap mt-2 break-words">
            {parts.map((part, index) =>
                urlRegex.test(part) ? (
                    <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline"
                        onClick={(e) => e.stopPropagation()} // Prevents card clicks when clicking a link
                    >
                        {part}
                    </a>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </p>
    );
};

export default ClickableNoteContent;