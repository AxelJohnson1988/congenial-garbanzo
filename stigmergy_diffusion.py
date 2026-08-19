"""
Stigmergy-Based Diffusion simulation using PAD (Pleasure-Arousal-Dominance) vectors.

PAD is a three-dimensional affective model from psychology (Mehrabian & Russell, 1974)
where emotional states are described by:
  - Pleasure   (P): how positive/negative the state feels  [-1, 1]
  - Arousal    (A): level of stimulation / activity        [-1, 1]
  - Dominance  (D): sense of control over the environment  [-1, 1]

Stigmergy is a swarm-intelligence mechanism (Grasse, 1959) in which agents leave
traces (pheromones / "dots") in a shared environment that influence future behaviour,
producing emergent self-organisation without central coordination.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum possible distance in the unit PAD cube: sqrt(3) ≈ 1.732.
# The 0.866 threshold equals sqrt(3)/2 — the midpoint of that range,
# commonly used to distinguish "proximate" from "distal" emotional states.
PAD_VARIANCE_THRESHOLD: float = math.sqrt(3) / 2  # ≈ 0.866


# ---------------------------------------------------------------------------
# Data structure
# ---------------------------------------------------------------------------

@dataclass
class Dot:
    """
    A single knowledge deposit in the stigmergy field.

    Attributes
    ----------
    pleasure : float
        Valence dimension of the PAD vector.  Range [-1, 1].
    arousal : float
        Activation dimension of the PAD vector.  Range [-1, 1].
    dominance : float
        Control dimension of the PAD vector.  Range [-1, 1].
    position : np.ndarray
        2-D spatial position ``[x, y]`` on the field grid.
    intensity : float
        Pheromone strength; decays over time steps.
    dot_id : str
        Unique identifier assigned automatically.
    """

    pleasure: float
    arousal: float
    dominance: float
    position: np.ndarray
    intensity: float = 1.0
    dot_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    @property
    def pad_vector(self) -> np.ndarray:
        """Return the PAD state as a NumPy array ``[P, A, D]``."""
        return np.array([self.pleasure, self.arousal, self.dominance], dtype=float)

    def pad_distance(self, other: "Dot") -> float:
        """Euclidean distance between two dots in PAD space."""
        return float(np.linalg.norm(self.pad_vector - other.pad_vector))

    def evaporate(self, rate: float = 0.05) -> None:
        """Reduce pheromone intensity by *rate* (clamped to zero)."""
        self.intensity = max(0.0, self.intensity - rate)

    def __repr__(self) -> str:
        p, a, d = self.pleasure, self.arousal, self.dominance
        return (
            f"Dot(id={self.dot_id}, P={p:+.3f}, A={a:+.3f}, D={d:+.3f}, "
            f"pos={self.position}, intensity={self.intensity:.3f})"
        )


# ---------------------------------------------------------------------------
# Variance function
# ---------------------------------------------------------------------------

def pad_variance(dots: List[Dot], threshold: float = PAD_VARIANCE_THRESHOLD) -> dict:
    """
    Calculate inter-dot PAD variance and classify dot pairs against *threshold*.

    Parameters
    ----------
    dots : list of Dot
        Collection of dots to analyse.
    threshold : float
        Distance threshold in PAD space.  Pairs with distance <= threshold are
        considered *proximate*; pairs above it are *distal*.
        Defaults to ``sqrt(3)/2 ≈ 0.866``.

    Returns
    -------
    dict with keys:
        ``mean_distance``   – mean pairwise PAD distance
        ``variance``        – variance of pairwise distances
        ``proximate_pairs`` – list of (dot_id_a, dot_id_b, distance) tuples
        ``distal_pairs``    – list of (dot_id_a, dot_id_b, distance) tuples
        ``centroid``        – mean PAD vector across all dots
    """
    if len(dots) < 2:
        return {
            "mean_distance": 0.0,
            "variance": 0.0,
            "proximate_pairs": [],
            "distal_pairs": [],
            "centroid": dots[0].pad_vector if dots else np.zeros(3),
        }

    distances: List[float] = []
    proximate: List[tuple] = []
    distal: List[tuple] = []

    for i in range(len(dots)):
        for j in range(i + 1, len(dots)):
            dist = dots[i].pad_distance(dots[j])
            distances.append(dist)
            entry = (dots[i].dot_id, dots[j].dot_id, round(dist, 6))
            if dist <= threshold:
                proximate.append(entry)
            else:
                distal.append(entry)

    dist_array = np.array(distances)
    centroid = np.mean([d.pad_vector for d in dots], axis=0)

    return {
        "mean_distance": float(np.mean(dist_array)),
        "variance": float(np.var(dist_array)),
        "proximate_pairs": proximate,
        "distal_pairs": distal,
        "centroid": centroid,
    }


# ---------------------------------------------------------------------------
# Stigmergy field simulation
# ---------------------------------------------------------------------------

class StigmergyField:
    """
    2-D grid representing a stigmergy environment.

    Agents deposit *Dot* objects whose PAD-weighted pheromone intensity
    diffuses across neighbouring cells each step, then evaporates.

    Parameters
    ----------
    width, height : int
        Grid dimensions in cells.
    diffusion_rate : float
        Fraction of a cell's pheromone that spreads to each neighbour per step.
    evaporation_rate : float
        Fraction of each dot's ``intensity`` that decays per step.
    """

    def __init__(
        self,
        width: int = 20,
        height: int = 20,
        diffusion_rate: float = 0.1,
        evaporation_rate: float = 0.05,
    ) -> None:
        self.width = width
        self.height = height
        self.diffusion_rate = diffusion_rate
        self.evaporation_rate = evaporation_rate

        # Scalar pheromone concentration grid (summed from dot intensities)
        self.grid: np.ndarray = np.zeros((height, width), dtype=float)

        self.dots: List[Dot] = []
        self.step_count: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def deposit(self, dot: Dot) -> None:
        """Place a dot on the field and stamp its intensity onto the grid."""
        x, y = self._clamp(dot.position)
        dot.position = np.array([x, y])
        self.grid[y, x] += dot.intensity
        self.dots.append(dot)

    def step(self) -> None:
        """Advance the simulation by one time step."""
        self._diffuse()
        self._evaporate_dots()
        self.step_count += 1

    def run(self, steps: int = 10) -> None:
        """Run the simulation for *steps* time steps."""
        for _ in range(steps):
            self.step()

    def active_dots(self) -> List[Dot]:
        """Return dots whose intensity is above zero."""
        return [d for d in self.dots if d.intensity > 0]

    def variance_report(self, threshold: float = PAD_VARIANCE_THRESHOLD) -> dict:
        """Return variance statistics for all currently active dots."""
        return pad_variance(self.active_dots(), threshold=threshold)

    def summary(self) -> str:
        """Return a human-readable summary of the current field state."""
        active = self.active_dots()
        report = self.variance_report()
        lines = [
            f"StigmergyField [{self.width}×{self.height}] — step {self.step_count}",
            f"  Active dots    : {len(active)}",
            f"  Grid max       : {self.grid.max():.4f}",
            f"  Grid mean      : {self.grid.mean():.4f}",
        ]
        if active:
            lines += [
                f"  PAD centroid   : P={report['centroid'][0]:+.3f}  "
                f"A={report['centroid'][1]:+.3f}  D={report['centroid'][2]:+.3f}",
                f"  Mean PAD dist  : {report['mean_distance']:.4f}  "
                f"(threshold={PAD_VARIANCE_THRESHOLD:.3f})",
                f"  PAD variance   : {report['variance']:.6f}",
                f"  Proximate pairs: {len(report['proximate_pairs'])}",
                f"  Distal pairs   : {len(report['distal_pairs'])}",
            ]
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _diffuse(self) -> None:
        """Spread pheromone to the 4-connected neighbours of each cell."""
        new_grid = self.grid.copy()
        # Amount leaving each cell
        outflow = self.grid * self.diffusion_rate
        new_grid -= outflow

        # Distribute to neighbours (with boundary clamping)
        share = outflow / 4.0
        new_grid[:-1, :] += share[1:, :]   # from south
        new_grid[1:, :]  += share[:-1, :]  # from north
        new_grid[:, :-1] += share[:, 1:]   # from east
        new_grid[:, 1:]  += share[:, :-1]  # from west

        self.grid = np.clip(new_grid, 0.0, None)

    def _evaporate_dots(self) -> None:
        """Evaporate each dot's individual intensity."""
        for dot in self.dots:
            dot.evaporate(self.evaporation_rate)

    def _clamp(self, position: np.ndarray) -> tuple:
        x = int(np.clip(round(float(position[0])), 0, self.width - 1))
        y = int(np.clip(round(float(position[1])), 0, self.height - 1))
        return x, y


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

def _demo() -> None:
    rng = np.random.default_rng(seed=42)

    field = StigmergyField(width=20, height=20, diffusion_rate=0.1, evaporation_rate=0.02)

    # Deposit 12 dots with random PAD vectors and positions
    for _ in range(12):
        dot = Dot(
            pleasure=float(rng.uniform(-1, 1)),
            arousal=float(rng.uniform(-1, 1)),
            dominance=float(rng.uniform(-1, 1)),
            position=rng.integers(0, 20, size=2).astype(float),
            intensity=float(rng.uniform(0.5, 1.0)),
        )
        field.deposit(dot)

    print("=== Initial state ===")
    print(field.summary())

    field.run(steps=20)

    print("\n=== After 20 steps ===")
    print(field.summary())

    # Show dots still active
    active = field.active_dots()
    print(f"\nActive dots ({len(active)}):")
    for dot in active:
        print(" ", dot)

    # Variance detail
    report = field.variance_report()
    print(f"\nProximate pairs (dist ≤ {PAD_VARIANCE_THRESHOLD:.3f}):")
    for pair in report["proximate_pairs"][:5]:
        print(f"  {pair[0]} ↔ {pair[1]}  dist={pair[2]:.4f}")


if __name__ == "__main__":
    _demo()
