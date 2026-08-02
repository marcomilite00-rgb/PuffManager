import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PARTICLE_COUNT = 80;

const generatePositions = (count: number) => {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }
  return pos;
};

const positions = generatePositions(PARTICLE_COUNT);

const Particles: React.FC = () => {
  const mesh = useRef<THREE.Points>(null!);

  useFrame(({ clock }) => {
    if (mesh.current) {
      mesh.current.rotation.y = clock.getElapsedTime() * 0.02;
      mesh.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.015) * 0.1;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#00bcd4"
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const Scene: React.FC = () => (
  <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: false }} style={{ pointerEvents: 'none' }}>
    <Particles />
  </Canvas>
);

const Fallback: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none" style={{
    background: 'radial-gradient(ellipse at 50% 30%, rgba(0,188,212,0.06) 0%, transparent 60%)'
  }} />
);

const ParticleBackground: React.FC = () => {
  const [hasWebGL, setHasWebGL] = React.useState(true);

  React.useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setHasWebGL(false);
    } catch {
      setHasWebGL(false);
    }
  }, []);

  if (!hasWebGL) return <Fallback />;

  return (
    <Suspense fallback={<Fallback />}>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-60">
        <Scene />
      </div>
    </Suspense>
  );
};

export default ParticleBackground;
