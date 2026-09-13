#!/usr/bin/env python3
"""Figure 4 — Courbe de priorisation valeur/effort des briques YAHRIA.
Follows typesetting/charts.md: no top/right spines, dashed grid 20% opacity,
legend outside via bbox_to_anchor, single blue color family, French labels.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Deep navy palette (Template 07 blue family)
DEEP = '#1a4a7a'
ACCENT = '#2d7ab3'
MUTED = '#5a7a96'
GRID = '#c0d0e2'
TEXT = '#142840'

# (label, effort x, value y, category, label_dx, label_dy, ha)
points = [
    ("Core",                 4.6, 9.40, "v1",   0.00,  0.42, "center"),
    ("Money",                6.8, 9.50, "v1",   0.00,  0.42, "center"),
    ("Finance",              7.5, 8.75, "v1",   0.15, -0.68, "center"),
    ("Business Graph",       8.2, 9.30, "v1",   0.35,  0.42, "center"),
    ("AI Gateway",           3.8, 7.40, "v1",   0.00,  0.42, "center"),
    ("Agents lecture seule", 6.0, 8.20, "v1",   0.00,  0.42, "center"),
    ("Copilotes dirigeants", 3.6, 8.60, "v1",   0.00,  0.42, "center"),
    ("Agents en écriture",   9.0, 8.90, "p2",   0.00, -0.68, "center"),
    ("Country Packs (17)",   7.0, 7.20, "p2",   0.00, -0.68, "center"),
    ("Sector Engines (13)",  8.6, 5.90, "p2",   0.00, -0.68, "center"),
    ("API Platform",         5.2, 7.00, "p2",   0.00, -0.68, "center"),
    ("Marketplace",          8.9, 3.90, "diff", 0.00,  0.42, "center"),
]

styles = {
    "v1":   dict(color=DEEP,   label="Priorité V1 (0–12 mois)"),
    "p2":   dict(color=ACCENT, label="Phase 2 (12–24 mois)"),
    "diff": dict(color=MUTED,  label="Différer"),
}

fig, ax = plt.subplots(figsize=(9.0, 5.6), dpi=200, constrained_layout=True)

# Quadrant reference lines
ax.axvline(6.2, color=GRID, linewidth=1.1, linestyle=(0, (4, 4)), zorder=1)
ax.axhline(8.0, color=GRID, linewidth=1.1, linestyle=(0, (4, 4)), zorder=1)

# Quadrant captions (very light)
ax.text(0.35, 10.35, "VICTOIRES RAPIDES", fontsize=9.5, color=MUTED,
        fontweight='bold', alpha=0.55)
ax.text(6.55, 10.35, "PROJETS STRUCTURANTS", fontsize=9.5, color=MUTED,
        fontweight='bold', alpha=0.55)
ax.text(0.35, 1.15, "REMPLISSAGE", fontsize=9.5, color=MUTED,
        fontweight='bold', alpha=0.55)
ax.text(6.55, 1.15, "PIÈGES DE SCOPE", fontsize=9.5, color=MUTED,
        fontweight='bold', alpha=0.55)

for label, x, y, cat, dx, dy, ha in points:
    st = styles[cat]
    ax.scatter(x, y, s=210, color=st['color'], edgecolors='white',
               linewidths=1.6, zorder=3)
    ax.annotate(label, (x, y), xytext=(x + dx, y + dy), ha=ha,
                fontsize=10.5, color=TEXT, fontweight='bold', zorder=4)

ax.set_xlim(0.5, 10.4)
ax.set_ylim(0.8, 10.9)
ax.set_xlabel("Effort d'implémentation (complexité, dépendances, maintenance)",
              fontsize=11.5, color=TEXT)
ax.set_ylabel("Valeur stratégique différenciante", fontsize=11.5, color=TEXT)
ax.set_xticks(range(1, 11))
ax.set_yticks(range(1, 11))
ax.tick_params(colors=MUTED, labelsize=10)

ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(GRID)
ax.spines['bottom'].set_color(GRID)
ax.grid(True, linestyle='--', alpha=0.2, linewidth=0.5, color=DEEP)

handles = [plt.Line2D([0], [0], marker='o', color='white',
                      markerfacecolor=st['color'], markersize=11,
                      label=st['label']) for st in styles.values()]
ax.legend(handles=handles, loc='lower left', bbox_to_anchor=(0.0, 1.02),
          ncol=3, frameon=False, fontsize=10, handletextpad=0.35,
          columnspacing=1.6)

fig.savefig('/home/z/my-project/assets_yahria/fig4_priorisation.png',
            facecolor='white')
print("OK fig4_priorisation.png")
