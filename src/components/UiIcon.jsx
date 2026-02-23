function UiIcon({ name, className = '' }) {
  const icons = {
    editor: (
      <path
        d="M3.5 4.5h9m-9 3.5h6m-6 3.5h9M2.75 2.75h10.5a.5.5 0 0 1 .5.5v9.5a.5.5 0 0 1-.5.5H2.75a.5.5 0 0 1-.5-.5v-9.5a.5.5 0 0 1 .5-.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    preview: (
      <path
        d="M2.25 4.25a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-6.5Zm0 0 5.75 4 5.75-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    console: (
      <path
        d="m3.5 5.25 2.25 2.25L3.5 9.75m3.25 0h3.75M2.75 3.25h10.5v9.5H2.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    chat: (
      <path
        d="M3.25 3.25h9.5v6.5h-4l-2.5 2v-2h-3a1 1 0 0 1-1-1v-6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    run: (
      <path d="m5 4 6 3.5L5 11V4Z" fill="currentColor" stroke="currentColor" strokeWidth="0.4" strokeLinejoin="round" />
    ),
    focus: (
      <path
        d="M3 6V3h3M13 6V3h-3M3 9v3h3M13 9v3h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    dock: (
      <path
        d="M2.75 3.25h10.5v6H2.75zm3 8.5h4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    export: (
      <path
        d="M8 2.75v6m0 0-2.25-2.25M8 8.75l2.25-2.25M3 10.5v1.75h10V10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    reset: (
      <path
        d="M4.25 5.5A4.25 4.25 0 1 1 3.8 9m.45-3.5V3.25H6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    folder: (
      <path
        d="M2.75 5a1 1 0 0 1 1-1H6l1 1h5.25a1 1 0 0 1 1 1v5.25a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1V5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    folderOpen: (
      <path
        d="M2.75 5a1 1 0 0 1 1-1H6l1 1h5.25a1 1 0 0 1 .97 1.25l-.8 3.5a1 1 0 0 1-.97.75H3.75a1 1 0 0 1-.97-.75l-.8-3.5A1 1 0 0 1 2.75 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    file: (
      <path
        d="M4 2.75h5L12.25 6v7.25H4zM9 2.75V6h3.25M5.5 8.25h5M5.5 10.25h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    chevronDown: (
      <path
        d="m4 6 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    chevronRight: (
      <path
        d="m6 4 4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  };

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        {icons[name] || null}
      </svg>
    </span>
  );
}

export default UiIcon;
