type GoogleIconProps = {
  className?: string;
};

const GoogleIcon = ({ className }: GoogleIconProps) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21.35 11.1h-9.18v2.98h5.27c-.5 2.52-2.66 3.9-5.27 3.9-3.12 0-5.65-2.57-5.65-5.73s2.53-5.73 5.65-5.73c1.41 0 2.69.53 3.67 1.4l2.2-2.24a8.89 8.89 0 0 0-5.87-2.18c-4.92 0-8.91 4.04-8.91 9.01s3.99 9.01 8.91 9.01c5.14 0 8.52-3.62 8.52-8.73 0-.58-.06-1.14-.18-1.69z"
      fill="currentColor"
    />
  </svg>
);

export default GoogleIcon;
