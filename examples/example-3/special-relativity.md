---
title: A Short Introduction to Special Relativity
author: Marcus Adeyemi
subject: The core equations of special relativity and how to compute them
keywords: physics, relativity, lorentz factor, time dilation, mass-energy
description: A gentle, equation-first tour of special relativity for curious readers.
date: 2026-07-11
field: Physics
level: Introductory
---

# A Short Introduction to Special Relativity

In 1905 Albert Einstein published a paper that quietly dismantled the idea of
absolute time. Special relativity starts from two innocent-looking assumptions
and follows them, without compromise, to conclusions that still feel strange a
century later: moving clocks run slow, moving rulers shrink, and mass is a form
of stored energy.

This primer walks through the handful of equations that do all the work. None of
the mathematics is harder than a square root — the difficulty is entirely in
taking the results seriously.

## Table of Contents

- [The Two Postulates](#the-two-postulates)
- [The Lorentz Factor](#the-lorentz-factor)
- [Time Dilation](#time-dilation)
- [Length Contraction](#length-contraction)
- [Mass and Energy](#mass-and-energy)
- [Computing the Factor](#computing-the-factor)

## The Two Postulates

Everything below rests on just two statements:

1. The laws of physics are the same in every inertial (non-accelerating) frame.
2. The speed of light in a vacuum, $c \approx 3 \times 10^8\ \text{m/s}$, is the
   same for every observer, no matter how fast the source or observer moves.[^post]

> [!NOTE]
> The second postulate is the radical one. If light always travels at $c$ for
> everyone, then two observers moving relative to each other *cannot* agree on
> how much time has passed — and that disagreement is exactly what the equations
> below quantify.

## The Lorentz Factor

Almost every result in special relativity is governed by a single dimensionless
quantity, the **Lorentz factor** $\gamma$, which depends only on the relative
speed $v$:

$$
\gamma = \frac{1}{\sqrt{1 - \dfrac{v^2}{c^2}}}
$$

When $v \ll c$, the ratio $v^2/c^2$ is tiny and $\gamma \approx 1$, which is why
everyday life looks perfectly Newtonian. As $v$ approaches $c$, the denominator
shrinks toward zero and $\gamma$ grows without bound.

| Speed $v/c$ | Lorentz factor $\gamma$ |
| ----------: | ----------------------: |
|        0.10 |                   1.005 |
|        0.50 |                   1.155 |
|        0.90 |                   2.294 |
|        0.99 |                   7.089 |

## Time Dilation

If a clock ticks off a time interval $\Delta t_0$ in its own rest frame, an
observer who sees it moving measures a *longer* interval:

$$
\Delta t = \gamma \, \Delta t_0
$$

Because $\gamma \ge 1$, the moving clock always appears to run slow. This is not
an illusion or a mechanical defect — it is a property of time itself, and it has
been confirmed with atomic clocks flown aboard aircraft.

## Length Contraction

The same factor works in reverse for distances. An object of rest length $L_0$
is measured, along its direction of motion, to be shorter:

$$
L = \frac{L_0}{\gamma}
$$

At $v = 0.9c$ a metre stick would measure only about $0.44\ \text{m}$ to a
stationary observer.

> [!WARNING]
> These formulas apply to *inertial* frames — constant velocity, no
> acceleration and no gravity. Accelerating frames and gravitation require
> **general** relativity, whose mathematics is a great deal heavier.

## Mass and Energy

The most famous equation in physics states that the rest energy of a body is
proportional to its mass:

$$
E = mc^2
$$

It is really a special case of the fuller relation, which also accounts for a
body's momentum $p$:

$$
E^2 = (mc^2)^2 + (pc)^2
$$

For a particle at rest, $p = 0$ and the second term vanishes, recovering
$E = mc^2$. For a massless particle such as a photon, $m = 0$ and the relation
collapses to $E = pc$.

## Computing the Factor

The Lorentz factor is trivial to evaluate numerically. The helper below takes a
speed in metres per second and returns $\gamma$:

```python
from math import sqrt

C = 299_792_458  # speed of light, m/s


def lorentz_factor(v: float) -> float:
    """Return the Lorentz factor for a speed v (m/s)."""
    beta = v / C
    if beta >= 1:
        raise ValueError("nothing with mass can reach or exceed c")
    return 1 / sqrt(1 - beta**2)


for fraction in (0.1, 0.5, 0.9, 0.99):
    print(f"{fraction:>4} c -> gamma = {lorentz_factor(fraction * C):.3f}")
```

> [!TIP]
> Notice the guard against $v \ge c$. In relativity the Lorentz factor diverges
> at the speed of light, which is the mathematical way of saying that no massive
> object can ever quite get there.

Run it and you will reproduce the table above — proof that a century-old thought
experiment fits in a dozen lines of code. :rocket:

[^post]: Einstein's original 1905 paper, *On the Electrodynamics of Moving
    Bodies*, states both postulates in its opening pages; almost everything in
    this primer is a direct consequence of them.

---

Written with `md2x`. The universe kept the receipts — the equations just read
them back.
