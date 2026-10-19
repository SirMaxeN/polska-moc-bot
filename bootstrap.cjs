// Passenger loads a CommonJS startup file; the application uses ES modules.
import('./app.js').catch(error => {
  console.error('Application startup failed:', error.code ?? error.name);
  process.exitCode = 1;
});
