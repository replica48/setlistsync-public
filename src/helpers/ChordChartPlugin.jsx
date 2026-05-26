import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $getSelection,
    $isRangeSelection,
    createCommand,
    DecoratorNode,
    $isNodeSelection,
    $getNodeByKey,
} from "lexical";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from 'react-dom';
import chords from '@tombatossals/chords-db/src/db.js';
import Chord from "@tombatossals/react-chords/lib/Chord";

const chordDiagramCustomizations = {
    diagram: {
        strings: '#4A5568', // Lighter gray for strings
        frets: '#4A5568',   // Lighter gray for frets
        dots: '#1A202C',    // Dark, solid color for dots
        barre: '#1A202C'    // Dark, solid color for the barre
    },
    text: {
        color: '#1A202C', // Black finger numbers for contrast on white background
        size: 0.7, // Slightly smaller text
    }
};

const transformChordData = (chordPosition) => {
    if (!chordPosition) {
        return { frets: [], fingers: [], barres: [], baseFret: 1 };
    }
    const frets = chordPosition.frets ? chordPosition.frets.split('').map(f => (f === 'x' ? -1 : parseInt(f, 10))) : [];
    const fingers = chordPosition.fingers ? chordPosition.fingers.split('').map(f => (f === 'x' || f === ' ' ? 0 : parseInt(f, 10))) : [];
    const rawBarres = chordPosition.barres ? (Array.isArray(chordPosition.barres) ? chordPosition.barres : [chordPosition.barres]) : [];
    const playableFrets = frets.filter(f => f > 0);
    const baseFret = playableFrets.length > 0 ? Math.min(...playableFrets) : 1;
    const relativeFrets = frets.map(f => f > 0 ? (f - baseFret + 1) : f);
    const relativeBarres = rawBarres.map(b => b - baseFret + 1);
    return {
        frets: relativeFrets,
        fingers,
        barres: relativeBarres,
        baseFret,
        capotasto: chordPosition.capotasto || false
    };
};

// --- THIS IS THE FIX ---
// We create a dedicated React component for the decorator.
// This component can safely use React hooks like useLexicalComposerContext.
function ChordComponent({ nodeKey }) {
    const [editor] = useLexicalComposerContext();
    const node = editor.getEditorState().read(() => $getNodeByKey(nodeKey));

    const handleClick = (event) => {
        event.stopPropagation();
        editor.dispatchCommand(CHORD_CLICK_COMMAND, {
            instrument: node.__instrument,
            root: node.__root,
            suffix: node.__suffix,
        });
    };

    return <span onClick={handleClick}>{node.__root}{node.__suffix}</span>;
}

// --- 1. Define the Chord Node ---
class ChordNode extends DecoratorNode {
    __instrument;
    __root;
    __suffix;

    static getType() {
        return 'chord';
    }

    static clone(node) {
        return new ChordNode(node.__instrument, node.__root, node.__suffix, node.__key);
    }

    constructor(instrument, root, suffix, key) {
        super(key);
        this.__instrument = instrument;
        this.__root = root;
        this.__suffix = suffix;
    }

    // --- Data Serialization ---
    static importJSON(serializedNode) {
        const { instrument, root, suffix } = serializedNode;
        return $createChordNode(instrument, root, suffix);
    }

    exportJSON() {
        return {
            type: 'chord',
            version: 1,
            instrument: this.__instrument,
            root: this.__root,
            suffix: this.__suffix,
        };
    }

    createDOM(config) {
        const span = document.createElement('span');
        span.className = 'user-select-none cursor-pointer font-bold text-blue-600';
        span.style.margin = '0 2px';
        return span;
    }

    updateDOM(prevNode, dom, config) {
        // Returning false tells Lexical that this node does not need its
        // DOM element replacing with a new copy from createDOM.
        return false; 
    }

    decorate() {
        // The decorate method now returns our new React component.
        return <ChordComponent nodeKey={this.getKey()} />;
    }
}

export function $createChordNode(instrument, root, suffix) {
    return new ChordNode(instrument, root, suffix);
}

export function $isChordNode(node) {
    return node instanceof ChordNode;
}

// --- 2. Define the Command to Insert a Chord ---
export const INSERT_CHORD_COMMAND = createCommand();
export const CHORD_CLICK_COMMAND = createCommand(); // Export the click command

// --- NEW: Chord Tooltip Component ---
function ChordTooltip({ editor, nodeKey }) {
    const [chordData, setChordData] = useState(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef(null);
    const [node, setNode] = useState(null);

    useEffect(() => {
        editor.getEditorState().read(() => {
            const n = $getNodeByKey(nodeKey);
            if ($isChordNode(n)) {
                setNode(n);
                const domElement = editor.getElementByKey(nodeKey);
                if (domElement) {
                    const rect = domElement.getBoundingClientRect();
                    setPosition({
                        top: rect.bottom + window.scrollY + 5,
                        left: rect.left + window.scrollX,
                    });
                }
                const instrumentData = chords[n.__instrument];
                const chordInfo = instrumentData?.chords[n.__root]?.find(c => c.suffix === n.__suffix);
                if (instrumentData && chordInfo && chordInfo.positions.length > 0) {
                    setChordData({
                        instrument: { ...instrumentData.main, keys: instrumentData.keys, tunings: instrumentData.tunings },
                        chord: transformChordData(chordInfo.positions[0])
                    });
                }
            }
        });
    }, [editor, nodeKey]);

    if (!chordData || !node) return null;

    return createPortal(
        <div
            ref={tooltipRef}
            style={{ top: position.top, left: position.left }}
            className="absolute z-50 bg-white p-2 rounded-md shadow-lg w-48"
        >
            <h3 className="text-xl font-bold text-center mb-2 text-black">{node.__root}{node.__suffix}</h3>
            <Chord
                chord={chordData.chord}
                instrument={chordData.instrument}
                customizations={chordDiagramCustomizations}
            />
        </div>,
        document.body
    );
}

function useChordTooltips(editor) {
    // This would contain the logic to show/hide tooltips on click
    // For brevity, we will add this logic directly into the main plugin component
}

// --- 3. Create the Plugin ---
export default function ChordPlugin() {
    const [editor] = useLexicalComposerContext();
    const [activeTooltip, setActiveTooltip] = useState(null);

    useEffect(() => {
        if (!editor.hasNodes([ChordNode])) {
            throw new Error('ChordPlugin: ChordNode not registered on editor');
        }

        // Command to insert a new chord
        const removeInsertListener = editor.registerCommand(
            INSERT_CHORD_COMMAND,
            (payload) => {
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        const { instrument, root, suffix } = payload;
                        const chordNode = $createChordNode(instrument, root, suffix);
                        selection.insertNodes([chordNode]);
                    }
                });
                return true;
            },
            0,
        );

        // --- NEW: Click handler to show/hide tooltips ---
        const handleClick = (event) => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isNodeSelection(selection)) {
                    const node = selection.getNodes()[0];
                    if ($isChordNode(node)) {
                        // If clicking the same chord, toggle it off. Otherwise, show the new one.
                        setActiveTooltip(prev => prev === node.getKey() ? null : node.getKey());
                        return;
                    }
                }
                // If clicking anywhere else, hide the tooltip
                setActiveTooltip(null);
            });
        };

        const rootElement = editor.getRootElement();
        rootElement?.addEventListener('click', handleClick);

        return () => {
            removeInsertListener();
            rootElement?.removeEventListener('click', handleClick);
        };
    }, [editor, setActiveTooltip]);

    return activeTooltip ? <ChordTooltip editor={editor} nodeKey={activeTooltip} /> : null;
}

export { ChordNode };