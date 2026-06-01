import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { $generateNodesFromDOM } from '@lexical/html';
import { TRANSFORMERS } from '@lexical/markdown';
import { $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection';
import {
    $getSelection,
    $getRoot,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    REDO_COMMAND,
    SELECTION_CHANGE_COMMAND,
    TextNode,
    UNDO_COMMAND,
} from 'lexical';
import React, { useCallback, useEffect, useState, memo } from 'react';
import ImagesPlugin, { INSERT_IMAGE_COMMAND, ImageNode } from './ImagePlugin';

const theme = {
    ltr: 'text-left',
    rtl: 'text-right',
    paragraph: 'm-0 mb-2',
    quote: 'm-0 ml-5 border-l-4 border-gray-500 pl-4',
    heading: {
        h1: 'text-3xl font-bold',
        h2: 'text-2xl font-bold',
        h3: 'text-xl font-bold',
    },
    list: {
        nested: {
            listitem: 'list-none',
        },
        ol: 'list-decimal ml-6',
        ul: 'list-disc ml-6',
        listitem: 'my-1',
    },
    link: 'text-sky-400 hover:underline',
    text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
    },
    code: 'bg-gray-900 text-gray-200 font-mono block whitespace-pre-wrap p-4 my-2 rounded-md overflow-x-auto',
    image: 'block my-4',
};

function BracketHighlightPlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const chordTransform = (textNode) => {
            // A strict guard to prevent infinite loops. Do not transform if the node
            // is not a simple text node.
            if (!textNode.isSimpleText()) {
                return;
            }

            const textContent = textNode.getTextContent();
            const chordRegex = /\[([^\]]+)\]/g;
            const matches = Array.from(textContent.matchAll(chordRegex));

            if (matches.length === 0) {
                return;
            }
            
            // If the node is already entirely bold, it's likely part of a manually
            // formatted section, so we can ignore it.
            if (textNode.hasFormat('bold')) {
                // However, we need to check if it's just a chord that was already transformed.
                // If the whole text is a single chord, we can safely skip.
                if (matches.length === 1 && matches[0][0] === textContent) {
                    return;
                }
            }
            
            // Iterate backwards to ensure the match indices remain correct after splitting.
            for (let i = matches.length - 1; i >= 0; i--) {
                const match = matches[i];
                const chordText = match[0];
                const startIndex = match.index;

                if (startIndex === undefined) continue;

                // The node we are attempting to split. It may change in each iteration.
                let nodeToSplit = textNode;
                
                // Find the target node in the chain of siblings if it was already split
                let sibling = textNode.getPreviousSibling();
                while(sibling) {
                    if (sibling.getTextContent().includes(chordText)) {
                        nodeToSplit = sibling;
                        break;
                    }
                    sibling = sibling.getPreviousSibling();
                }

                // If the target part of the text is already bold, skip it.
                if(nodeToSplit.hasFormat('bold')) continue;


                let chordNode;

                // Split after the chord
                if (startIndex + chordText.length < nodeToSplit.getTextContentSize()) {
                    chordNode = nodeToSplit.splitText(startIndex + chordText.length)[0];
                } else {
                    chordNode = nodeToSplit;
                }
                
                // Split before the chord
                if (startIndex > 0) {
                    chordNode = chordNode.splitText(startIndex)[1];
                }
                
                // Now that the chord is an isolated TextNode, apply the bold format.
                chordNode.setFormat('bold');
            }
        };

        return editor.registerNodeTransform(TextNode, chordTransform);
    }, [editor]);

    return null;
}

// --- FIX: Stable editor configuration outside the component ---
const editorConfig = {
    namespace: 'MyEditor',
    theme,
    onError(error) {
        console.error(error);
        throw error;
    },
    nodes: [
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        TableNode,
        TableCellNode,
        TableRowNode,
        AutoLinkNode,
        LinkNode,
        ImageNode,
    ],
};

function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [fontFamily, setFontFamily] = useState("'Roboto Mono', Menlo, Monaco, 'Courier New', monospace");

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setFontFamily($getSelectionStyleValueForProperty(selection, 'font-family') || "'Roboto Mono', Menlo, Monaco, 'Courier New', monospace");
        }
    }, []);

    useEffect(() => {
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                updateToolbar();
            });
        });
        return unregister;
    }, [editor, updateToolbar]);

    const onFontChange = (e) => {
        const newFontFamily = e.target.value;
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $patchStyleText(selection, { 'font-family': newFontFamily });
            }
        });
    };

    return (
        <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-600">
            <button type="button" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} className="p-2 hover:bg-gray-700 rounded-md">Undo</button>
            <button type="button" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} className="p-2 hover:bg-gray-700 rounded-md">Redo</button>
            <div className="w-px h-6 bg-gray-600 mx-2"></div>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} className={`p-2 rounded-md ${isBold ? 'bg-sky-600' : 'hover:bg-gray-700'}`} title="Bold">B</button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} className={`p-2 rounded-md ${isItalic ? 'bg-sky-600' : 'hover:bg-gray-700'}`} title="Italic">I</button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} className={`p-2 rounded-md ${isUnderline ? 'bg-sky-600' : 'hover:bg-gray-700'}`} title="Underline">U</button>
            <div className="w-px h-6 bg-gray-600 mx-2"></div>
            <select value={fontFamily} onChange={onFontChange} className="bg-gray-700 p-2 rounded-md text-white" title="Select Font">
                <option value="'Roboto Mono', Menlo, Monaco, 'Courier New', monospace">Roboto Mono</option>
                <option value="'Source Code Pro', monospace">Source Code Pro</option>
                <option value="'Inconsolata', monospace">Inconsolata</option>
                <option value="'Ubuntu Mono', monospace">Ubuntu Mono</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
                <option value="'Lucida Console', Monaco, monospace">Lucida Console</option>
            </select>
        </div>
    );
}


const LexicalEditor = memo(function LexicalEditor({ initialContent, onChange, placeholder = "Enter lyrics and chords ( [Am], [E7], etc )..." }) {
    
    const initialConfig = {
        ...editorConfig,
        editorState: (editor) => {
            if (initialContent) {
                if (initialContent.startsWith('{')) {
                    // Assume it's JSON
                    try {
                        const parsedState = editor.parseEditorState(initialContent);
                        editor.setEditorState(parsedState);
                    } catch (e) {
                        console.error("Failed to parse initial content as JSON", e);
                    }
                } else {
                    // Fallback to HTML parsing for backward compatibility
                    editor.update(() => {
                        const parser = new DOMParser();
                        const dom = parser.parseFromString(initialContent, 'text/html');
                        const nodes = $generateNodesFromDOM(editor, dom);
                        const root = $getRoot();
                        root.clear();
                        root.select();
                        const selection = $getSelection();
                        selection?.insertNodes(nodes);
                    });
                }
            }
        },
    };

    return (
        <div className="bg-gray-700 text-white rounded-md overflow-hidden border border-gray-600">
            <LexicalComposer initialConfig={initialConfig}>
                <ToolbarPlugin />
                <div className="relative">
                    <RichTextPlugin
                        contentEditable={<ContentEditable className="p-4 h-64 overflow-y-auto outline-none" style={{ fontFamily: "'Roboto Mono', Menlo, Monaco, 'Courier New', monospace" }} />}
                        placeholder={<div className="absolute top-4 left-4 text-gray-500 pointer-events-none">{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <OnChangePlugin onChange={(editorState) => {
                        const jsonString = JSON.stringify(editorState.toJSON());
                        onChange(jsonString);
                    }} />
                    <HistoryPlugin />
                    <LinkPlugin />
                    <BracketHighlightPlugin />
                    <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                </div>
            </LexicalComposer>
        </div>
    );
});

export default LexicalEditor;