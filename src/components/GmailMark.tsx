export default function GmailMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#4285F4" d="M6 40h7V23L3 15.5V37a3 3 0 0 0 3 3z" />
      <path fill="#34A853" d="M35 40h7a3 3 0 0 0 3-3V15.5L35 23z" />
      <path fill="#FBBC04" d="M35 10v13l10-7.5V11.5c0-3.7-4.2-5.8-7.2-3.6z" />
      <path fill="#EA4335" d="M13 23V10l11 8.25L35 10v13l-11 8.25z" />
      <path fill="#C5221F" d="M3 11.5v4L13 23V10l-2.8-2.1C7.2 5.7 3 7.8 3 11.5z" />
    </svg>
  );
}
