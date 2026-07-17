import logoDark from "@/assets/logo-IO-dark.png";
import logoLight from "@/assets/logo-IO-light.png";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  surface?: "dark" | "theme";
};

const BrandLogo = ({
  alt = "Iberica Oposiciones",
  className,
  surface = "theme"
}: BrandLogoProps) => {
  if (surface === "dark")
    return <img src={logoDark} alt={alt} className={className} />;

  return (
    <>
      <img src={logoLight} alt={alt} className={cn("dark:hidden", className)} />
      <img
        src={logoDark}
        alt={alt}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
};

export default BrandLogo;
