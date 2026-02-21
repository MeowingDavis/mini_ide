function PreviewFrame({ srcDoc, iframeRef }) {
  return (
    <iframe
      ref={iframeRef}
      title="Live Preview"
      className="preview-frame"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
    />
  );
}

export default PreviewFrame;
