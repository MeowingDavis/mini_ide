export const DEFAULT_PROJECT_FILES = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <nav>
      <!-- Add navigation links here -->
    </nav>
  </header>
  <main>
    <!-- Add main content here -->
  </main>
  <script src="main.js" defer></script>
</body>
</html>`,
  'styles.css': `/* Add your styles here */`,
  'main.js': `// Add your JavaScript here`
};

export const FILE_ORDER = ['index.html', 'styles.css', 'main.js'];

export const FILE_LANGUAGE = {
  'index.html': 'html',
  'styles.css': 'css',
  'main.js': 'javascript'
};
