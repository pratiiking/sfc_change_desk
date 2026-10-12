// For a plain DATEONLY string ("YYYY-MM-DD"), `new Date(str)` parses it as
// UTC midnight -- in any timezone behind UTC, formatting that back with
// toLocaleDateString silently rolls the displayed date back by one day.
// Parsing the year/month/day as local components avoids that entirely.
export const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return dateStr;
};
