/** Simple line icons. Decorative: always shown next to a text label, never alone. */

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-6h4v6h4.5V10',
  back: 'M19 12H5m6-6-6 6 6 6',
  search: 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5-1.5L21 21',
  donate: 'M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20Z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h3',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 9c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16.5 4.5a3.3 3.3 0 0 1 0 6.3M18 14.8c2 .7 3.2 2.4 3.5 5.2',
  expense: 'M4 7h16v12H4V7Zm0 4h16M8 15h3M7 7V4h10v3',
  deposit: 'M3 9.5 12 4l9 5.5M5 10v8m4.5-8v8m5-8v8M19 10v8M3 20h18',
  scheme: 'M12 3v18M5 8c0-2 3-3 7-3s7 1 7 3-3 3-7 3-7 1-7 3 3 3 7 3 7-1 7-3',
  report: 'M5 20V10m5 10V4m5 16v-8m5 8V7M3 20h18',
  review: 'M5 4h14v16H5V4Zm3 5 2 2 4-4M8 16h8',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5 2-1.5-2-3.5-2.4.8-1.6-1L15.5 4h-4l-.5 2.8-1.6 1L7 7 5 10.500 7 12l-2 1.500L7 17l2.400-.8 1.600 1 .5 2.8h4l.5-2.8 1.600-1 2.400.8 2-3.500L20 12Z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.500-11.500a2.500 2.500 0 1 1 3.500 2.300c-.700.300-1 .900-1 1.700M12 17v.01',
  event: 'M5 6h14v14H5V6Zm0 4h14M9 3v4m6-4v4',
  print: 'M7 8V4h10v4M7 17H4V9h16v8h-3M7 14h10v6H7v-6Z',
  download: 'M12 4v11m-4.500-4.500L12 15l4.500-4.500M5 20h14',
  plus: 'M12 5v14M5 12h14',
  warn: 'M12 4 2.500 20h19L12 4Zm0 6v5m0 2.500v.01',
  ok: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8v.01',
  error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9',
  source: 'M6 3h9l4 4v14H6V3Zm8 0v5h5M9 13h7M9 17h5',
  bank: 'M4 20h16M6 20v-8m4 8v-8m4 8v-8m4 8v-8M3 10l9-6 9 6H3Z',
  mail: 'M4 6h16v12H4V6Zm0 1 8 6 8-6',
};

export default function Icon({ name, size = '1.4em' }) {
  const d = PATHS[name] || PATHS.info;
  return (
    <svg
      aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none' }}
    >
      <path d={d} />
    </svg>
  );
}
