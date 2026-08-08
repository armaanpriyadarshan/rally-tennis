# Prerequisites — the shortest path to deep-RL intuition

Profile this was built for: first-year undergrad, comfortable through real analysis,
lackluster neural-network knowledge, goal = strong RL intuition for the self-play
project (see MEMORY: phases 0-3). Ordered; do them in sequence. Every item has a
**Do** attached — if you skip the Do, the reading was the pointless kind.

Phase 0 (the scripted Rally b3ot) needs *none* of this. Its only prerequisite is
reading your own game's physics — `index.html`, the SIMULATION section and the two
CPU sections, which are heavily commented. This list is for Phases 1-3.

---

1. **3Blue1Brown — Neural Networks, season 1** (4 videos, ~1h)
   Geometric intuition for what a network is, what gradient descent does, what
   backprop computes. Appetizer only.
   **Do:** nothing. Watch at 1.5×.

2. **Karpathy — "Neural Networks: Zero to Hero", lectures 1-4** (~10h with pauses)
   Build backprop from scratch (micrograd), then small language models (makemore).
   This permanently fixes "my NN knowledge is lackluster," and it is 90% doing.
   **Do:** rebuild micrograd yourself without looking at his repo; then re-derive
   backprop for a 2-layer net on paper. With real analysis this is comfortable —
   it's the chain rule with bookkeeping.
   *(Skip the GPT lectures for now — wrong direction for this project.)*

3. **Sutton & Barto — "Reinforcement Learning: An Introduction", ch. 1-6** (free PDF)
   The intuition bible. Bandits → MDPs (ch. 3 is the most important chapter in the
   book) → dynamic programming → Monte Carlo → TD learning. Read slowly; 2-3
   chapters a week is fast.
   **Do:** after ch. 6, implement tabular Q-learning on a gridworld in plain numpy
   — that is Phase 1, rung 1. David Silver's UCL lectures 1-4 mirror these
   chapters if you want a video companion.

4. **Karpathy — "Deep RL: Pong from Pixels"** (blog post)
   The canonical bridge from tabular RL to deep RL; derives policy gradients with
   nothing but intuition.
   **Do:** re-derive the REINFORCE gradient yourself on paper (log-derivative
   trick + expectation — your analysis background makes this a 20-minute exercise,
   and it's the single highest-value derivation in the field).

5. **OpenAI Spinning Up — Parts 1-3, plus the essay "Spinning Up as a Deep RL
   Researcher"**
   The parts give you the algorithm landscape (value-based vs policy-based, and
   where PPO sits). The essay is literally about how people develop RL research
   taste — your "see things no one else sees" ambition has a literature, and this
   is its front door.
   **Do:** implement REINFORCE, then one of DQN/PPO, on CartPole (Phase 1, rung 2).
   Run 5 seeds. The variance you see is your first real RL lesson.

6. **Sutton — "The Bitter Lesson"** (2 pages)
   The most argued-about essay in the field, directly relevant to "would an agent
   discover things humans didn't."
   **Do:** write 5 sentences in the experiment log agreeing or disagreeing.

7. **When you reach self-play** (Phase 1, rung 3+):
   - AlphaZero paper (Silver et al., *Science* 2018 — very readable)
   - OpenAI "Emergent Tool Use" (hide-and-seek) blog + paper
   - Czarnecki et al., "Real World Games Look Like Spinning Tops" (before Phase 3)
   **Do (AlphaZero):** before reading, write down how *you* would design self-play
   training for chess. Then diff your design against theirs. The gaps are the
   lesson.

---

**What NOT to read:** generic ML-course material (supervised learning, transformers,
Kaggle), RL theory monographs (Bertsekas, Szepesvári — later, if ever), and paper
collections. This list is short on purpose: a finished short list beats an
aspirational long one.

**On "genius ideas":** RL intuition is built in a loop — predict what the agent
will do → run it → be wrong → explain why. Reading gives you vocabulary; the log
of your own wrong predictions is the intuition. That's what the experiment-log
table in the README is for. Total: ~40-60 focused hours to be dangerous.
