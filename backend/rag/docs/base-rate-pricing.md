# How the Base Rate Drives Product Pricing

The base rate is our internal reference rate. It is the starting point from which
every product's offered rate is derived. The base rate itself is a live figure:
it is retrieved from the rate system at quote time and is never published in this
knowledge base. This document explains how the base rate is *used*, not what it
currently is.

## Deriving a product rate

Each product applies an adjustment to the base rate:

- Start from the current base rate.
- Add the product's rate adjustment (its "overlay spread").
- Add or subtract any borrower-specific loan-level price adjustments.

The result is the offered note rate for that borrower and product. Because the
base rate moves, an offered rate is only valid for the day it is quoted.

## Locking

A rate lock freezes the offered rate for a set number of days. Once locked, base
rate movements no longer change the borrower's rate for that loan. Unlocked
pipelines are re-priced whenever the base rate changes.

## Term and product effects

Shorter terms generally price below longer terms because the lender's exposure is
shorter. Government products (FHA, VA) and conventional products carry different
spreads over the base rate; see the product overlays document for eligibility and
adjustment rules.

## When to quote

Never quote a rate from memory or from this document. Always request the live
base rate and apply the current adjustments. If the rate system is unavailable,
tell the borrower a quote cannot be produced right now rather than guessing.
