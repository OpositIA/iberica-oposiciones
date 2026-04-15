import { cn } from "@/lib/utils";
import {
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from "react";

type RevealVariant = "up" | "soft" | "gentle" | "left" | "right" | "scale";

type RevealOwnProps<T extends ElementType = "div"> = {
  as?: T;
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
  variant?: RevealVariant;
};

type RevealProps<T extends ElementType = "div"> = RevealOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof RevealOwnProps<T>>;

const Reveal = <T extends ElementType = "div">({
  as,
  children,
  className,
  delay = 0,
  duration = 720,
  once = true,
  rootMargin = "0px 0px -6% 0px",
  threshold = 0.08,
  variant = "up",
  ...props
}: RevealProps<T>) => {
  const Component = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (reducedMotionQuery.matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(entry.target);
          return;
        }

        if (!once) setIsVisible(false);
      },
      {
        root: null,
        rootMargin,
        threshold
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  const { style, ...restProps } = props;

  return (
    <Component
      ref={ref}
      className={cn(
        "reveal",
        `reveal-${variant}`,
        isVisible && "is-visible",
        className
      )}
      {...restProps}
      style={
        {
          ...(style as CSSProperties),
          "--reveal-delay": `${delay}ms`,
          "--reveal-duration": `${duration}ms`
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export default Reveal;
