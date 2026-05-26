import React, { createContext, useContext } from 'react';

const EditorContext = createContext(null);

export function useEditorContext() {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditorContext must be used within an EditorContextProvider');
    }
    return context;
}

export function EditorContextProvider({ children, storage, bandId, songId }) {
    const value = { storage, bandId, songId };
    return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}