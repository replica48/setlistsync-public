import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useMemo } from 'react';
import { $getRoot, $createParagraphNode, TextNode, $createTextNode } from 'lexical';
import { CodeNode } from '@lexical/code';
import { ImageNode } from './ImagePlugin';
import { ChordNode, $createChordNode, $isChordNode, CHORD_CLICK_COMMAND } from './nodes/ChordNode.jsx';

const theme = {
    // Make the theme match your app's styling
    paragraph: 'm-0 mb-2',
    quote: 'm-0 ml-5 border-l-4 border-gray-500 pl-4',
    heading: {
        h1: 'text-3xl font-bold',
        h2: 'text-2xl font-bold',
        h3: 'text-xl font-bold',
    },
    list: {
        ol: 'list-decimal ml-6',
        ul: 'list-disc ml-6',
    },
    link: 'text-sky-400 hover:underline',
    text: {
        bold: 'font-extrabold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
        chord: 'text-sky-300 font-extrabold',
        invalidChord: 'text-yellow-400 font-extrabold',
    },
    code: 'bg-gray-900 text-gray-200 font-mono block whitespace-pre-wrap p-4 my-2 rounded-md overflow-x-auto',
    image: 'block my-4',
};

// This plugin runs once when the viewer is created and handles all content types.
function ViewerPlugin({ contentJSON, onUpdate, onChordClick }) {
    const [editor] = useLexicalComposerContext();

    // --- COMMAND LISTENER FOR CHORD CLICKS ---
    useEffect(() => {
        if (!onChordClick) return;
        const unregister = editor.registerCommand(
            CHORD_CLICK_COMMAND,
            (payload) => {
                onChordClick(payload);
                return true; // Indicates the command was handled
            },
            1 // Priority
        );
        return () => unregister();
    }, [editor, onChordClick]);

    // --- NORMALIZATION & CHORD STYLING TRANSFORM ---
    useEffect(() => {
        const unregister = editor.registerNodeTransform(TextNode, (textNode) => {
            if ($isChordNode(textNode)) {
                return;
            }

            const textContent = textNode.getTextContent();
            const chordRegex = /\[([^\]]+)\]/g;
            const matches = Array.from(textContent.matchAll(chordRegex));

            if (matches.length === 0) {
                return;
            }

            const nodes = [];
            let lastIndex = 0;
            const originalFormat = textNode.getFormat();

            for (const match of matches) {
                const [chordWithBrackets] = match;
                const startIndex = match.index;

                if (startIndex > lastIndex) {
                    const textPart = textContent.substring(lastIndex, startIndex);
                    const textNodePart = $createTextNode(textPart);
                    textNodePart.setFormat(originalFormat);
                    nodes.push(textNodePart);
                }

                const chordNode = $createChordNode(chordWithBrackets);
                // The new ChordNode should not inherit the bold format from the text it's replacing,
                // as its styling is self-contained in its createDOM method.
                // However, it should inherit other styles like italic.
                // 1 is BOLD format. We remove it.
                chordNode.setFormat(originalFormat & ~1); 

                nodes.push(chordNode);
                lastIndex = startIndex + chordWithBrackets.length;
            }

            if (lastIndex < textContent.length) {
                const textPart = textContent.substring(lastIndex);
                const textNodePart = $createTextNode(textPart);
                textNodePart.setFormat(originalFormat);
                nodes.push(textNodePart);
            }

            // Replacing the original node with the new set of nodes.
            // Using a spread operator to pass all nodes as arguments.
            textNode.replace(...nodes);
        });
        return () => unregister();
    }, [editor]);

    // Pass through to the content loading plugin
    return <ViewerInitialContentPlugin contentJSON={contentJSON} onUpdate={onUpdate} />;
}

// This plugin handles loading the initial HTML content into the viewer.
function ViewerInitialContentPlugin({ contentJSON, onUpdate }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        // Using a timeout defers this logic until after the initial render,
        // preventing the "flushSync" error.
        const timer = setTimeout(() => {
            editor.update(() => {
                const root = $getRoot();
                root.clear();

                const content = contentJSON || '';
                // Heuristic to check for plaintext: no HTML tags and not a JSON string.
                const isPlainText = content && !/<[a-z][\s\S]*>/i.test(content) && !content.startsWith('{');
                const requiresUpdate = isPlainText && onUpdate;

                if (isPlainText) {
                    // Handle plaintext by splitting into paragraphs
                    const lines = content.split('\n');
                    lines.forEach(line => {
                        const paragraphNode = $createParagraphNode();
                        paragraphNode.append($createTextNode(line));
                        root.append(paragraphNode);
                    });
                } else if (content.startsWith('{')) {
                    // Handle Lexical JSON state
                    try {
                        const editorState = editor.parseEditorState(content);
                        editor.setEditorState(editorState);
                    } catch (e) {
                        console.error("Failed to parse Lexical JSON", e);
                        root.append($createParagraphNode());
                    }
                } else if (content) {
                    // Handle HTML content
                    const parser = new DOMParser();
                    const dom = parser.parseFromString(content, 'text/html');
                    const nodes = $generateNodesFromDOM(editor, dom);
                    root.append(...nodes);
                } else {
                    // Handle empty content
                    root.append($createParagraphNode());
                }
                
                // The NodeTransforms will handle normalization automatically.

                // If conversion happened, trigger the update callback with the new JSON state.
                if (requiresUpdate) {
                    const newContent = JSON.stringify(editor.getEditorState().toJSON());
                    onUpdate(newContent);
                }
            });
        }, 0);

        return () => {
            clearTimeout(timer);
        };

    }, [editor, contentJSON, onUpdate]);

    return null;
}

export default function LexicalViewer({ contentJSON, onUpdate, onChordClick, validChordNames }) {
    const viewerConfig = useMemo(() => ({
        editable: false,
        namespace: 'Viewer',
        theme,
        onError: (error) => console.error("LexicalViewer error:", error),
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            LinkNode,
            CodeNode,
            ImageNode,
            AutoLinkNode,
            ChordNode,
        ],
    }), []);

    return (
        <LexicalComposer initialConfig={viewerConfig}>
            <RichTextPlugin contentEditable={<ContentEditable className="outline-none" />} placeholder={null} ErrorBoundary={LexicalErrorBoundary} />
            <ViewerPlugin contentJSON={contentJSON} onUpdate={onUpdate} onChordClick={onChordClick} validChordNames={validChordNames} />
        </LexicalComposer>
    );
}