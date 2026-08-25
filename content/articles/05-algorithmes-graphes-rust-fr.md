---
title: GRAPHES · RUST [FR]
sub: De la théorie à l'optimisation
year: 2025
---

Les graphes décrivent des relations : routes, dépendances, réseaux ou ordre
d'exécution. Dans mon moteur ECS, chaque nœud représente un système et chaque
arc une contrainte. Leur traitement conditionne le parallélisme disponible
pendant une frame.

::image{src=medium/algorithmes-graphes-rust-fr/01.webp alt="Graphe orienté et graphe au carré" rows=9}

## CHOISIR LA REPRÉSENTATION

Une liste d'adjacence ne stocke que les arcs existants et convient aux graphes
creux. Une matrice d'adjacence coûte davantage en mémoire, mais répond en temps
constant à la question « cet arc existe-t-il ? » et se prête bien aux calculs
denses.

Le graphe au carré G² relie u à v lorsqu'un chemin de longueur maximale deux
existe. L'algorithme de référence parcourt source, destination et intermédiaire,
soit trois boucles imbriquées. Il est simple à valider, mais son coût O(V³)
devient vite prohibitif.

::image{src=medium/algorithmes-graphes-rust-fr/02.webp alt="Matrice d'adjacence" rows=9}

## PREMIER RACCOURCI

Dès qu'un intermédiaire prouve l'existence du chemin, la recherche peut
s'arrêter. Cet early break ne change pas le pire cas, mais évite beaucoup de
tests inutiles sur des graphes réels.

## COMPACTER EN BITS

Une ligne de matrice peut être stockée comme un ensemble de bits. Un u64 encode
64 arcs possibles ; des opérations AND et OR remplacent une série de
comparaisons scalaires. On réduit à la fois l'empreinte mémoire et le nombre
d'instructions.

::image{src=medium/algorithmes-graphes-rust-fr/03.webp alt="Encodage binaire des lignes du graphe" rows=9}

## VECTORISER

Les bitsets sont un terrain naturel pour SIMD. Un registre AVX traite plusieurs
mots de 64 bits simultanément. Le gain dépend toutefois d'un accès contigu,
d'un volume suffisant et d'une gestion propre des éléments restants.

::image{src=medium/algorithmes-graphes-rust-fr/04.webp alt="Traitement SIMD de plusieurs mots" rows=9}

## PARALLÉLISER

Chaque ligne du résultat étant indépendante, Rayon peut les distribuer entre
les cœurs sans mutation partagée. Le work stealing équilibre la charge. Cette
organisation a un coût fixe : elle ralentit les petits graphes et devient
rentable seulement lorsque chaque tâche contient assez de travail.

::image{src=medium/algorithmes-graphes-rust-fr/05.webp alt="Résultats des benchmarks selon la taille" rows=10}

## CONCLUSIONS

- Sur un petit graphe, la simplicité minimise les surcoûts.
- Sur une taille moyenne, les bitsets et SIMD prennent l'avantage.
- Sur un grand graphe, le parallélisme peut enfin amortir son orchestration.
- La densité influence les branches, la mémoire et la quantité de travail utile.
- Une accélération n'a de sens que face à une référence correcte et mesurée.

Cette démarche est réutilisable : écrire une version évidente, la tester,
profiler, puis optimiser une seule dimension. Big O explique l'évolution ; le
benchmark révèle les constantes et les seuils qui comptent dans le moteur.

