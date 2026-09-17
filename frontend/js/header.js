// ==========================================
// SHORT RANDOM QUOTES & LOCATION-ACCURATE CLOCK
// ==========================================

const shortQuotes = [
  '"Action cures fear."',
  '"Done is better than perfect."',
  '"Focus on being productive."',
  '"Small steps every day."',
  '"Make today count."',
  '"Dream big. Start small."',
  '"Begin anywhere."',
  '"Discipline beats motivation."',
  '"One task at a time."',
  '"Progress, not perfection."'
];

function initHeaderAndLocation() {
  const randomQuote = shortQuotes[Math.floor(Math.random() * shortQuotes.length)];
  document.getElementById('quoteHeader').innerText = randomQuote;

  function updateClock() {
    const now = new Date();
    document.getElementById('localClock').innerText = now.toLocaleTimeString();

    const hours = now.getHours();
    let timeOfDay = 'Good morning';
    if (hours >= 12 && hours < 17) timeOfDay = 'Good afternoon';
    else if (hours >= 17) timeOfDay = 'Good evening';

    const profile = getProfile?.();
    document.getElementById('greetingHeader').innerText = profile?.name
      ? `${timeOfDay}, ${profile.name}`
      : timeOfDay;

    checkAlarms(now);
  }

  setInterval(updateClock, 1000);
  updateClock();
  document.addEventListener('profile:updated', updateClock);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      () => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        document.getElementById('userLocation').innerText = `Location timezone: ${tz}`;
      },
      () => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        document.getElementById('userLocation').innerText = `Timezone: ${tz}`;
      }
    );
  }
}
