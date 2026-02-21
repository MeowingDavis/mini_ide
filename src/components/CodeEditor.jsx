import Editor from '@monaco-editor/react';

function CodeEditor({ language, value, onChange, onMount, path }) {
  return (
    <Editor
      theme="vs-dark"
      language={language}
      path={path}
      value={value}
      onMount={(editor, monaco) => {
        if (onMount) {
          onMount(editor, monaco);
        }
      }}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        automaticLayout: true
      }}
    />
  );
}

export default CodeEditor;
