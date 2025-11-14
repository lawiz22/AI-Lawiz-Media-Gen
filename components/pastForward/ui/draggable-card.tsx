import React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

export const DraggableCardContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['12.5deg', '-12.5deg']);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-12.5deg', '12.5deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      className="relative"
    >
      {children}
    </motion.div>
  );
};

export const DraggableCardBody: React.FC<{ children: React.ReactNode; className?: string; dragConstraintsRef?: React.RefObject<HTMLElement>; onDragStart?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void; onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void; }> = ({ children, className, dragConstraintsRef, onDragStart, onDrag }) => {
  return (
    <motion.div
      drag
      dragConstraints={dragConstraintsRef}
      dragElastic={0.1}
      whileTap={{ scale: 1.05, cursor: "grabbing" }}
      onDragStart={onDragStart}
      onDrag={onDrag}
      style={{
        transformStyle: 'preserve-3d',
        transform: 'translateZ(75px)',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
