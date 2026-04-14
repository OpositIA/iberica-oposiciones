import logoDark from "@/assets/logo-IO-dark.png";
import logoLight from "@/assets/logo-IO-light.png";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  alt?: string;
  className?: string;
};

const BrandLogo = ({
  alt = "Iberica Oposiciones",
  className
}: BrandLogoProps) => (
  <>
    <img src={logoLight} alt={alt} className={cn("dark:hidden", className)} />
    <img
      src={logoDark}
      alt={alt}
      className={cn("hidden dark:block", className)}
    />
  </>
);

export default BrandLogo;
