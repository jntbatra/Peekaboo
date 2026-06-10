// Motion configurations for fluid structural morphing
import type { Variants } from 'framer-motion';

// Cubic bezier tuple — framer-motion v12 requires explicit tuple type
const SPRING_EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

export const peekVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.12, ease: SPRING_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -2,
    transition: { duration: 0.08, ease: 'easeIn' },
  },
};

export const responseVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, delay: 0.05 },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
};

export const historyVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export const chipVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, x: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    x: 4,
    transition: { duration: 0.1 },
  },
};
