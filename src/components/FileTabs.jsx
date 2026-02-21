import Tab from './Tab';

function FileTabs({ files, activeFile, onSelect }) {
  return (
    <div className="tabs editor-tabs" role="tablist" aria-label="Project files">
      {files.map((fileName) => (
        <Tab
          key={fileName}
          label={fileName}
          active={activeFile === fileName}
          onClick={() => onSelect(fileName)}
        />
      ))}
    </div>
  );
}

export default FileTabs;
