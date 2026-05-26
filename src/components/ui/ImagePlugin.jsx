import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isNodeSelection, $isRootNode, createCommand, DecoratorNode } from 'lexical';
import { useEffect } from 'react';

// --- 1. Define the Image Node ---
class ImageNode extends DecoratorNode {
    __src;
    __alt;

    static getType() {
        return 'image';
    }

    static clone(node) {
        return new ImageNode(node.__src, node.__alt, node.__key);
    }

    constructor(src, altText, key) {
        super(key);
        this.__src = src;
        this.__alt = altText;
    }

    // --- THIS IS THE FIX: Add serialization methods ---
    static importJSON(serializedNode) {
        const { src, altText } = serializedNode;
        return $createImageNode(src, altText);
    }

    exportJSON() {
        return {
            type: 'image',
            version: 1,
            src: this.__src,
            altText: this.__alt,
        };
    }

    createDOM(config) {
        const span = document.createElement('span');
        const theme = config.theme;
        const className = theme.image;
        if (className !== undefined) {
            span.className = className;
        }
        return span;
    }

    updateDOM() {
        return false;
    }

    decorate() {
        return <img src={this.__src} alt={this.__alt} className="max-w-full h-auto rounded-md" />;
    }
}

function $createImageNode(src, altText) {
    return new ImageNode(src, altText);
}

function $isImageNode(node) {
    return node instanceof ImageNode;
}

// --- 2. Define the Command to Insert an Image ---
export const INSERT_IMAGE_COMMAND = createCommand();

// --- 3. Create the Plugin ---
export default function ImagesPlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (!editor.hasNodes([ImageNode])) {
            throw new Error('ImagesPlugin: ImageNode not registered on editor');
        }

        return editor.registerCommand(
            INSERT_IMAGE_COMMAND,
            (payload) => {
                const selection = $getSelection();
                if ($isNodeSelection(selection) || $isRootNode(selection)) {
                    const imageNode = $createImageNode(payload.src, payload.altText);
                    selection.insertNodes([imageNode]);
                }
                return true;
            },
            0,
        );
    }, [editor]);

    return null;
}

export { ImageNode };