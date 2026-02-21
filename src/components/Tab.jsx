function Tab({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={`tab ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default Tab;
