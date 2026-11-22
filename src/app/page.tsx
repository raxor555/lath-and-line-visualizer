import type { Metadata } from "next";
import Tour from "@/components/tour/Tour";
import VisualizerGate from "@/components/tour/VisualizerGate";

export const metadata: Metadata = {
  title: "3D Room Visualizer · Lath & Line",
  description: "Photoreal 3D Wall Panel & Marble Visualizer for Interiors.",
};

export default function Home() {
  return (
    <VisualizerGate>
      <Tour />
    </VisualizerGate>
  );
}
