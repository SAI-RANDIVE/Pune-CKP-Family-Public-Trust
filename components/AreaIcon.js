/** Line icons for the areas of work and a few shared UI spots. Decorative: always aria-hidden. */
const PATHS = {
  book: <><path d="M4 5.5A2.5 2.500 0 0 1 6.500 3H12v16H6.500A2.500 2.500 0 0 0 4 21.500z" /><path d="M20 5.500A2.500 2.500 0 0 0 17.500 3H12v16h5.500a2.500 2.500 0 0 1 2.500 2.500z" /></>,
  heart: <><path d="M12 20.500s-7.500-4.600-9-9.400C2 7.600 4.300 4.500 7.500 4.500c1.900 0 3.400 1 4.500 2.700 1.100-1.700 2.600-2.700 4.500-2.700 3.200 0 5.500 3.100 4.500 6.600-1.500 4.800-9 9.400-9 9.400z" /><path d="M8 12h2.500l1.500-2.500 1.500 4 1-1.500H17" /></>,
  leaf: <><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19c2-4 5-7 9-9" /></>,
  hands: <><path d="M12 13.500 8.500 10a2.300 2.300 0 0 1 3.300-3.200l.200.200.200-.200A2.300 2.300 0 0 1 15.500 10z" /><path d="M3 14.500 6.500 13l5 3.500h4a1.500 1.500 0 0 1 0 3H11" /><path d="M3 20l8 1.500 9.500-4a1.600 1.600 0 0 0-1.200-3L15.500 16" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5.500H5a3 3 0 0 0 3 4M16 5.500h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8.500 20h7M10 17h4v3h-4z" /></>,
  music: <><path d="M9 18V6l10-2v11" /><circle cx="6.500" cy="18" r="2.500" /><circle cx="16.500" cy="15" r="2.500" /></>,
  calendar: <><rect x="3.500" y="5" width="17" height="15" rx="2.500" /><path d="M3.500 10h17M8 3v4M16 3v4" /></>,
  pin: <><path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11z" /><circle cx="12" cy="10" r="2.300" /></>,
  users: <><circle cx="9" cy="8.500" r="3.200" /><path d="M3 19.500c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500" /><path d="M16 5.700a3 3 0 0 1 0 5.600M17.500 14.300c2.100.600 3.500 2.400 3.500 5.200" /></>,
  phone: <path d="M5 4h3.500l1.500 4.500-2 1.500a12 12 0 0 0 6 6l1.500-2 4.500 1.500V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5.500" width="18" height="13" rx="2.500" /><path d="m4 7.500 8 6 8-6" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.500v7l6-3.500z" fill="currentColor" /></>,
  camera: <><path d="M4 8h3.500L9 5.500h6L16.500 8H20a1.500 1.500 0 0 1 1.500 1.500V18a1.500 1.500 0 0 1-1.500 1.500H4A1.500 1.500 0 0 1 2.500 18V9.500A1.500 1.500 0 0 1 4 8z" /><circle cx="12" cy="13.500" r="3.500" /></>,
  medal: <><circle cx="12" cy="15" r="5" /><path d="M9 10.500 6 3h4l2 4.500L14 3h4l-3 7.500" /><path d="m12 12.800.900 1.800 2 .300-1.450 1.400.350 2L12 17.400l-1.800.900.350-2L9.100 14.900l2-.300z" /></>,
  bank: <><path d="M3 9.500 12 4l9 5.500M5 10v8M9.500 10v8M14.500 10v8M19 10v8M3 20h18" /></>,
};

export default function AreaIcon({ name, className = 'h-6 w-6' }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths}
    </svg>
  );
}
