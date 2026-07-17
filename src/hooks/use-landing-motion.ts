import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)";
const COMPACT_QUERY = "(max-width: 1023px), (pointer: coarse)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const useLandingMotion = (
  rootRef: RefObject<HTMLElement>,
  language: string
) => {
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const select = gsap.utils.selector(root);
      const media = gsap.matchMedia();

      media.add(
        {
          compact: COMPACT_QUERY,
          desktop: DESKTOP_QUERY,
          reduceMotion: REDUCED_MOTION_QUERY
        },
        (context) => {
          const { compact, desktop, reduceMotion } = context.conditions as {
            compact: boolean;
            desktop: boolean;
            reduceMotion: boolean;
          };

          root.dataset.motion = reduceMotion ? "reduced" : "active";

          if (reduceMotion) {
            gsap.set(
              select(
                "[data-hero-intro], [data-reveal], [data-parallax], [data-story-frame]"
              ),
              { clearProps: "all" }
            );
            return;
          }

          const heroItems = select("[data-hero-intro]");
          gsap.fromTo(
            heroItems,
            { autoAlpha: 0, y: 28 },
            {
              autoAlpha: 1,
              duration: 1,
              ease: "power3.out",
              stagger: 0.09,
              y: 0
            }
          );

          const revealElements = gsap.utils.toArray<HTMLElement>(
            select("[data-reveal]")
          );

          revealElements.forEach((element) => {
            gsap.fromTo(
              element,
              { autoAlpha: 0, y: compact ? 16 : 32 },
              {
                autoAlpha: 1,
                duration: compact ? 0.6 : 0.85,
                ease: "power3.out",
                scrollTrigger: {
                  once: true,
                  start: "top 88%",
                  trigger: element
                },
                y: 0
              }
            );
          });

          if (!desktop) return;

          const hero = root.querySelector<HTMLElement>("[data-hero]");
          const heroMedia =
            root.querySelector<HTMLElement>("[data-hero-media]");
          const heroCopy = root.querySelector<HTMLElement>("[data-hero-copy]");

          if (hero && heroMedia) {
            gsap.fromTo(
              heroMedia,
              { scale: 1.03, yPercent: 0 },
              {
                ease: "none",
                scale: 1.1,
                scrollTrigger: {
                  end: "bottom top",
                  scrub: 0.7,
                  start: "top top",
                  trigger: hero
                },
                yPercent: 10
              }
            );
          }

          if (hero && heroCopy) {
            gsap.to(heroCopy, {
              autoAlpha: 0.28,
              ease: "none",
              scrollTrigger: {
                end: "bottom 20%",
                scrub: 0.55,
                start: "30% top",
                trigger: hero
              },
              yPercent: -12
            });
          }

          const parallaxElements = gsap.utils.toArray<HTMLElement>(
            select("[data-parallax]")
          );

          parallaxElements.forEach((element) => {
            const distance = Number(element.dataset.parallax ?? 8);
            const trigger = element.closest("section") ?? element;

            gsap.fromTo(
              element,
              { yPercent: -distance },
              {
                ease: "none",
                scrollTrigger: {
                  end: "bottom top",
                  scrub: 0.65,
                  start: "top bottom",
                  trigger
                },
                yPercent: distance
              }
            );
          });

          const scrollWords = gsap.utils.toArray<HTMLElement>(
            select("[data-scroll-word]")
          );

          scrollWords.forEach((word) => {
            gsap.fromTo(
              word,
              { xPercent: -8 },
              {
                ease: "none",
                scrollTrigger: {
                  end: "bottom top",
                  scrub: 0.8,
                  start: "top bottom",
                  trigger: word.closest("section") ?? word
                },
                xPercent: 8
              }
            );
          });

          const story = root.querySelector<HTMLElement>("[data-story]");
          const storyFrames = gsap.utils.toArray<HTMLElement>(
            select("[data-story-frame]")
          );
          const storyProgress = root.querySelector<HTMLElement>(
            "[data-story-progress]"
          );

          if (!story || storyFrames.length < 2) return;

          root.dataset.storyMotion = "active";
          gsap.set(storyFrames, { autoAlpha: 0, scale: 0.975, y: 46 });
          gsap.set(storyFrames[0], { autoAlpha: 1, scale: 1, y: 0 });

          if (storyProgress) {
            gsap.set(storyProgress, {
              scaleY: 0,
              transformOrigin: "top center"
            });
          }

          const storyTimeline = gsap.timeline({
            scrollTrigger: {
              end: "bottom bottom",
              invalidateOnRefresh: true,
              scrub: 0.7,
              start: "top top",
              trigger: story
            }
          });

          if (storyProgress) {
            storyTimeline.to(
              storyProgress,
              { duration: storyFrames.length - 0.25, ease: "none", scaleY: 1 },
              0
            );
          }

          storyFrames.slice(1).forEach((frame, index) => {
            const previousFrame = storyFrames[index];
            const position = index + 0.78;

            storyTimeline
              .to(
                previousFrame,
                {
                  autoAlpha: 0,
                  duration: 0.32,
                  ease: "power2.inOut",
                  scale: 0.985,
                  y: -30
                },
                position
              )
              .fromTo(
                frame,
                { autoAlpha: 0, scale: 0.975, y: 46 },
                {
                  autoAlpha: 1,
                  duration: 0.44,
                  ease: "power3.out",
                  scale: 1,
                  y: 0
                },
                position + 0.16
              );
          });

          return () => {
            delete root.dataset.storyMotion;
          };
        },
        root
      );

      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener("load", refresh, { once: true });
      void document.fonts?.ready.then(refresh);

      return () => {
        window.removeEventListener("load", refresh);
        delete root.dataset.motion;
        delete root.dataset.storyMotion;
        media.revert();
      };
    },
    {
      dependencies: [language],
      revertOnUpdate: true,
      scope: rootRef
    }
  );
};
