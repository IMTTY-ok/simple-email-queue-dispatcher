/**
 * Module 6 — Scheduled Delivery: the time-zone picker.
 * =====================================================
 *
 * The list offered by the schedule panel. Every entry is a real IANA zone,
 * so the server can resolve it without guessing.
 *
 * The browser's own zone is always offered as well, even when it is not on
 * this list — it is the one the user is most likely to want.
 */

export interface TimeZoneOption {
  value: string;
  label: string;
}

/** A short, readable name for a zone. */
function label(zone: string, name: string): string {
  return `${name} — ${zone}`;
}

export const TIME_ZONES: TimeZoneOption[] = [
  { value: 'UTC', label: label('UTC', 'UTC') },
  { value: 'Asia/Kolkata', label: label('Asia/Kolkata', 'India') },
  { value: 'Asia/Dubai', label: label('Asia/Dubai', 'United Arab Emirates') },
  { value: 'Asia/Karachi', label: label('Asia/Karachi', 'Pakistan') },
  { value: 'Asia/Dhaka', label: label('Asia/Dhaka', 'Bangladesh') },
  { value: 'Asia/Bangkok', label: label('Asia/Bangkok', 'Thailand') },
  { value: 'Asia/Jakarta', label: label('Asia/Jakarta', 'Indonesia') },
  { value: 'Asia/Singapore', label: label('Asia/Singapore', 'Singapore') },
  { value: 'Asia/Hong_Kong', label: label('Asia/Hong_Kong', 'Hong Kong') },
  { value: 'Asia/Shanghai', label: label('Asia/Shanghai', 'China') },
  { value: 'Asia/Tokyo', label: label('Asia/Tokyo', 'Japan') },
  { value: 'Asia/Seoul', label: label('Asia/Seoul', 'South Korea') },
  { value: 'Australia/Sydney', label: label('Australia/Sydney', 'Sydney') },
  { value: 'Australia/Melbourne', label: label('Australia/Melbourne', 'Melbourne') },
  { value: 'Pacific/Auckland', label: label('Pacific/Auckland', 'Auckland') },
  { value: 'Europe/London', label: label('Europe/London', 'London') },
  { value: 'Europe/Dublin', label: label('Europe/Dublin', 'Dublin') },
  { value: 'Europe/Lisbon', label: label('Europe/Lisbon', 'Lisbon') },
  { value: 'Europe/Paris', label: label('Europe/Paris', 'Paris') },
  { value: 'Europe/Berlin', label: label('Europe/Berlin', 'Berlin') },
  { value: 'Europe/Madrid', label: label('Europe/Madrid', 'Madrid') },
  { value: 'Europe/Rome', label: label('Europe/Rome', 'Rome') },
  { value: 'Europe/Amsterdam', label: label('Europe/Amsterdam', 'Amsterdam') },
  { value: 'Europe/Stockholm', label: label('Europe/Stockholm', 'Stockholm') },
  { value: 'Europe/Warsaw', label: label('Europe/Warsaw', 'Warsaw') },
  { value: 'Europe/Athens', label: label('Europe/Athens', 'Athens') },
  { value: 'Europe/Kyiv', label: label('Europe/Kyiv', 'Kyiv') },
  { value: 'Europe/Istanbul', label: label('Europe/Istanbul', 'Istanbul') },
  { value: 'Europe/Moscow', label: label('Europe/Moscow', 'Moscow') },
  { value: 'Africa/Cairo', label: label('Africa/Cairo', 'Cairo') },
  { value: 'Africa/Johannesburg', label: label('Africa/Johannesburg', 'Johannesburg') },
  { value: 'Africa/Lagos', label: label('Africa/Lagos', 'Lagos') },
  { value: 'Africa/Nairobi', label: label('Africa/Nairobi', 'Nairobi') },
  { value: 'America/New_York', label: label('America/New_York', 'New York') },
  { value: 'America/Chicago', label: label('America/Chicago', 'Chicago') },
  { value: 'America/Denver', label: label('America/Denver', 'Denver') },
  { value: 'America/Los_Angeles', label: label('America/Los_Angeles', 'Los Angeles') },
  { value: 'America/Toronto', label: label('America/Toronto', 'Toronto') },
  { value: 'America/Mexico_City', label: label('America/Mexico_City', 'Mexico City') },
  { value: 'America/Bogota', label: label('America/Bogota', 'Bogotá') },
  { value: 'America/Sao_Paulo', label: label('America/Sao_Paulo', 'São Paulo') },
  { value: 'America/Argentina/Buenos_Aires', label: label('America/Argentina/Buenos_Aires', 'Buenos Aires') },
  { value: 'Pacific/Honolulu', label: label('Pacific/Honolulu', 'Honolulu') },
];

/**
 * The zones offered in the picker, with the browser's own zone added when
 * it is not already on the list.
 */
export function timeZoneOptions(browserZone: string): TimeZoneOption[] {
  if (!browserZone) return TIME_ZONES;
  if (TIME_ZONES.some((zone) => zone.value === browserZone)) return TIME_ZONES;
  return [
    { value: browserZone, label: label(browserZone, 'This device') },
    ...TIME_ZONES,
  ];
}
