// ==========================================
// NOTES
// Previously the textarea had no id and nothing ever saved it — anything
// typed vanished the moment you switched views or refreshed. Now it
// autosaves (debounced) and shows a small "Saved" indicator.
// ==========================================

function initNotesFeature() {
  const textarea = document.getElementById('notesTextarea');
  const status = document.getElementById('notesStatus');
  if (!textarea) return;

  textarea.value = loadJSON(STORAGE_KEYS.NOTES, '');

  const persist = debounce(() => {
    saveJSON(STORAGE_KEYS.NOTES, textarea.value);
    if (status) status.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  }, 500);

  textarea.addEventListener('input', () => {
    if (status) status.textContent = 'Saving…';
    persist();
  });
}
