/**
 * Legacy entrypoint kept for backward compatibility.
 *
 * The scheduler daemon now lives in src/scheduler/daemon.ts.
 */

console.warn('⚠️  get_all.ts is deprecated. Running the new scheduler daemon instead.');

void import('./scheduler/daemon');
