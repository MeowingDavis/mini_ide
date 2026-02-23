import { useEffect, useMemo, useState } from 'react';
import UiIcon from './UiIcon';

function sortNames(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function buildTree(fileNames, folderPaths) {
  const root = {
    folders: new Map(),
    files: []
  };

  const ensureFolderNode = (folderPath) => {
    const parts = String(folderPath || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    let cursor = root;
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!cursor.folders.has(part)) {
        cursor.folders.set(part, {
          name: part,
          path: currentPath,
          folders: new Map(),
          files: []
        });
      }
      cursor = cursor.folders.get(part);
    }
    return cursor;
  };

  (folderPaths || []).forEach((folderPath) => {
    if (folderPath) {
      ensureFolderNode(folderPath);
    }
  });

  (fileNames || []).forEach((filePath) => {
    const cleanPath = String(filePath || '').trim();
    if (!cleanPath) {
      return;
    }
    const parts = cleanPath.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      return;
    }
    const parent = parts.join('/');
    const parentNode = parent ? ensureFolderNode(parent) : root;
    parentNode.files.push({ name: fileName, path: cleanPath });
  });

  const toArrayNode = (node) => ({
    folders: [...node.folders.values()]
      .sort((a, b) => sortNames(a.name, b.name))
      .map((folder) => ({
        name: folder.name,
        path: folder.path,
        ...toArrayNode(folder)
      })),
    files: [...node.files].sort((a, b) => sortNames(a.name, b.name))
  });

  return toArrayNode(root);
}

function getParentFolder(filePath) {
  const index = String(filePath || '').lastIndexOf('/');
  return index > 0 ? filePath.slice(0, index) : '';
}

function ExplorerRowFolder({
  folder,
  depth,
  collapsed,
  activeFile,
  dragState,
  onToggle,
  onSelectFile,
  onContextMenu,
  onDragStartItem,
  onDragEndItem,
  onDragOverFolder,
  onDropOnFolder
}) {
  const isCollapsed = collapsed.has(folder.path);
  const isActiveBranch = activeFile && activeFile.startsWith(`${folder.path}/`);
  const isDropTarget = dragState.targetType === 'folder' && dragState.targetPath === folder.path;

  return (
    <>
      <button
        type="button"
        draggable
        className={`explorer-row explorer-row-folder ${isActiveBranch ? 'is-active-branch' : ''} ${
          isDropTarget ? 'is-drop-target' : ''
        } ${dragState.draggingType === 'folder' && dragState.draggingPath === folder.path ? 'is-dragging' : ''}`}
        onClick={() => onToggle(folder.path)}
        onContextMenu={(event) => onContextMenu(event, { type: 'folder', path: folder.path })}
        onDragStart={() => onDragStartItem('folder', folder.path)}
        onDragEnd={onDragEndItem}
        onDragOver={(event) => onDragOverFolder(event, folder.path)}
        onDrop={(event) => onDropOnFolder(event, folder.path)}
        style={{ '--depth': depth }}
        title={`${isCollapsed ? 'Expand' : 'Collapse'} ${folder.path}`}
      >
        <UiIcon name={isCollapsed ? 'chevronRight' : 'chevronDown'} className="explorer-caret" />
        <UiIcon name={isCollapsed ? 'folder' : 'folderOpen'} className="explorer-icon" />
        <span className="explorer-label">{folder.name}</span>
      </button>

      {!isCollapsed
        ? folder.folders.map((child) => (
            <ExplorerRowFolder
              key={child.path}
              folder={child}
              depth={depth + 1}
              collapsed={collapsed}
              activeFile={activeFile}
              dragState={dragState}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              onContextMenu={onContextMenu}
              onDragStartItem={onDragStartItem}
              onDragEndItem={onDragEndItem}
              onDragOverFolder={onDragOverFolder}
              onDropOnFolder={onDropOnFolder}
            />
          ))
        : null}

      {!isCollapsed
        ? folder.files.map((file) => {
            const fileDropTarget = dragState.targetType === 'file-parent' && dragState.targetPath === file.path;
            return (
              <button
                key={file.path}
                type="button"
                draggable
                className={`explorer-row explorer-row-file ${activeFile === file.path ? 'is-active' : ''} ${
                  fileDropTarget ? 'is-drop-target' : ''
                } ${dragState.draggingType === 'file' && dragState.draggingPath === file.path ? 'is-dragging' : ''}`}
                onClick={() => onSelectFile(file.path)}
                onContextMenu={(event) => onContextMenu(event, { type: 'file', path: file.path })}
                onDragStart={() => onDragStartItem('file', file.path)}
                onDragEnd={onDragEndItem}
                onDragOver={(event) => onDragOverFolder(event, getParentFolder(file.path), 'file-parent', file.path)}
                onDrop={(event) => onDropOnFolder(event, getParentFolder(file.path))}
                style={{ '--depth': depth + 1 }}
                title={file.path}
              >
                <span className="explorer-caret explorer-caret-spacer" aria-hidden="true" />
                <UiIcon name="file" className="explorer-icon" />
                <span className="explorer-label">{file.name}</span>
              </button>
            );
          })
        : null}
    </>
  );
}

function FileExplorer({
  fileNames,
  folders,
  activeFile,
  onSelectFile,
  onNewFile,
  onNewFolder,
  onDeleteFile,
  onDeleteFileByPath,
  onRenameFile,
  onDeleteFolder,
  onRenameFolder,
  onMoveFile,
  onMoveFolder
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dragState, setDragState] = useState({
    draggingType: '',
    draggingPath: '',
    targetType: '',
    targetPath: ''
  });
  const [menu, setMenu] = useState(null);
  const tree = useMemo(() => buildTree(fileNames, folders), [fileNames, folders]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const toggleFolder = (folderPath) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const openContextMenu = (event, item) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      item
    });
  };

  const beginDrag = (type, path) => {
    setDragState({
      draggingType: type,
      draggingPath: path,
      targetType: '',
      targetPath: ''
    });
  };

  const endDrag = () => {
    setDragState({
      draggingType: '',
      draggingPath: '',
      targetType: '',
      targetPath: ''
    });
  };

  const handleDragOverFolder = (event, folderPath, targetType = 'folder', targetPath = folderPath) => {
    if (!dragState.draggingType) {
      return;
    }
    event.preventDefault();
    setDragState((prev) => ({ ...prev, targetType, targetPath }));
  };

  const handleDropOnFolder = (event, folderPath) => {
    event.preventDefault();
    const targetFolder = folderPath || '';
    if (!dragState.draggingType || !dragState.draggingPath) {
      endDrag();
      return;
    }

    if (dragState.draggingType === 'file') {
      onMoveFile(dragState.draggingPath, targetFolder);
    } else if (dragState.draggingType === 'folder') {
      onMoveFolder(dragState.draggingPath, targetFolder);
    }

    endDrag();
  };

  const handleDropOnRoot = (event) => handleDropOnFolder(event, '');

  const renderContextMenu = () => {
    if (!menu) {
      return null;
    }

    const { item } = menu;
    const close = () => setMenu(null);

    const action = (fn) => () => {
      close();
      fn();
    };

    let items = [];
    if (item.type === 'file') {
      const parentFolder = getParentFolder(item.path);
      items = [
        { label: 'Open', onClick: action(() => onSelectFile(item.path)) },
        { label: 'Rename', onClick: action(() => onRenameFile(item.path)) },
        { label: 'Delete', onClick: action(() => onDeleteFileByPath(item.path)) },
        { separator: true },
        { label: 'New File Here', onClick: action(() => onNewFile(parentFolder ? `${parentFolder}/` : '')) },
        { label: 'New Folder Here', onClick: action(() => onNewFolder(parentFolder ? `${parentFolder}/` : '')) }
      ];
    } else if (item.type === 'folder') {
      items = [
        { label: 'New File Here', onClick: action(() => onNewFile(`${item.path}/`)) },
        { label: 'New Folder Here', onClick: action(() => onNewFolder(`${item.path}/`)) },
        { separator: true },
        { label: 'Rename Folder', onClick: action(() => onRenameFolder(item.path)) },
        { label: 'Delete Folder', onClick: action(() => onDeleteFolder(item.path)) }
      ];
    } else {
      items = [
        { label: 'New File', onClick: action(() => onNewFile('')) },
        { label: 'New Folder', onClick: action(() => onNewFolder('')) }
      ];
    }

    return (
      <div
        className="explorer-context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((menuItem, index) =>
          menuItem.separator ? (
            <div key={`sep-${index}`} className="explorer-context-separator" />
          ) : (
            <button key={`${menuItem.label}-${index}`} type="button" className="explorer-context-item" onClick={menuItem.onClick}>
              {menuItem.label}
            </button>
          )
        )}
      </div>
    );
  };

  const rootDropTarget = dragState.targetType === 'root';

  return (
    <aside className="explorer-panel" aria-label="File explorer" onContextMenu={(event) => openContextMenu(event, { type: 'root' })}>
      <div className="explorer-header">
        <div className="explorer-title">Explorer</div>
        <div className="explorer-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onNewFile('')} title="Create file">
            + File
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onNewFolder('')} title="Create folder">
            + Folder
          </button>
        </div>
      </div>

      <div
        className={`explorer-list ${rootDropTarget ? 'is-root-drop-target' : ''}`}
        role="tree"
        aria-label="Project files"
        onDragOver={(event) => {
          if (!dragState.draggingType) {
            return;
          }
          event.preventDefault();
          setDragState((prev) => ({ ...prev, targetType: 'root', targetPath: '' }));
        }}
        onDrop={handleDropOnRoot}
      >
        {tree.folders.map((folder) => (
          <ExplorerRowFolder
            key={folder.path}
            folder={folder}
            depth={0}
            collapsed={collapsed}
            activeFile={activeFile}
            dragState={dragState}
            onToggle={toggleFolder}
            onSelectFile={onSelectFile}
            onContextMenu={openContextMenu}
            onDragStartItem={beginDrag}
            onDragEndItem={endDrag}
            onDragOverFolder={handleDragOverFolder}
            onDropOnFolder={handleDropOnFolder}
          />
        ))}

        {tree.files.map((file) => {
          const fileDropTarget = dragState.targetType === 'file-parent' && dragState.targetPath === file.path;
          return (
            <button
              key={file.path}
              type="button"
              draggable
              className={`explorer-row explorer-row-file ${activeFile === file.path ? 'is-active' : ''} ${
                fileDropTarget ? 'is-drop-target' : ''
              } ${dragState.draggingType === 'file' && dragState.draggingPath === file.path ? 'is-dragging' : ''}`}
              onClick={() => onSelectFile(file.path)}
              onContextMenu={(event) => openContextMenu(event, { type: 'file', path: file.path })}
              onDragStart={() => beginDrag('file', file.path)}
              onDragEnd={endDrag}
              onDragOver={(event) => handleDragOverFolder(event, '', 'file-parent', file.path)}
              onDrop={(event) => handleDropOnFolder(event, '')}
              style={{ '--depth': 0 }}
              title={file.path}
            >
              <span className="explorer-caret explorer-caret-spacer" aria-hidden="true" />
              <UiIcon name="file" className="explorer-icon" />
              <span className="explorer-label">{file.name}</span>
            </button>
          );
        })}

        {fileNames.length === 0 ? <div className="explorer-empty">No files yet.</div> : null}
      </div>

      <div className="explorer-footer">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onDeleteFile}
          disabled={!activeFile}
          title={activeFile ? `Delete ${activeFile}` : 'No file selected'}
        >
          Delete Selected
        </button>
      </div>

      {renderContextMenu()}
    </aside>
  );
}

export default FileExplorer;
