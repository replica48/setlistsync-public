import { addClassNamesToElement } from '@lexical/utils';
import { $applyNodeReplacement, createCommand, TextNode } from 'lexical';
import { Chord } from 'tonal';

/**
 * A custom Lexical node to represent a clickable chord in the viewer.
 * It extends TextNode to inherit its properties but adds custom styling and behavior.
 */
export class ChordNode extends TextNode {
  static getType() {
    return 'chord';
  }

  isToken() {
    return true;
  }

  static clone(node) {
    // The 'bold' format is used as a simple way to apply the chord-specific styling
    // defined in the editor's theme.
    const chordNode = new ChordNode(node.__text, node.__key);
    return chordNode;
  }

  constructor(text = '', key) {
    super(text, key);
  }

  createDOM(config, editor) {
    const dom = super.createDOM(config);

    // Get the chord name by removing brackets, e.g., "[Am]" -> "Am"
    const chordName = this.__text.substring(1, this.__text.length - 1);

    // Check if it's a valid chord using the tonal library.
    const isValidChord = !Chord.get(chordName).empty;

    if (isValidChord) {
        // Valid chords get the blue, bold style from the theme.
        addClassNamesToElement(dom, config.theme.text.chord);
    } else {
        // Invalid "chords" get the yellow style from the theme.
        addClassNamesToElement(dom, config.theme.text.invalidChord);
    }

    // Add classes for interactivity
    addClassNamesToElement(dom, 'cursor-pointer hover:bg-sky-700/50 rounded-md px-1 transition-colors');

    // When the element is clicked, dispatch our custom command with the chord's text.
    dom.addEventListener('click', (event) => {
        event.preventDefault();
        editor.dispatchCommand(CHORD_CLICK_COMMAND, this.__text);
    });

    return dom;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'chord',
      version: 1,
    };
  }

  static importJSON(serializedNode) {
    const node = new ChordNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    return node;
  }
}

/**
 * A "factory" function to easily create a new ChordNode.
 * @param {string} text - The text content of the chord, e.g., "[Am]".
 * @returns {ChordNode}
 */
export function $createChordNode(text) {
  return new ChordNode(text);
}

export function $isChordNode(node) {
  return node instanceof ChordNode;
}

// A unique command that can be dispatched when a chord is clicked.
export const CHORD_CLICK_COMMAND = createCommand('CHORD_CLICK_COMMAND');
