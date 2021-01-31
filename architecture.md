
## Interview Questions

### Can you list any of the major programming paradigms in Javascript

#### Good to hear
 - Single threaded event model
 - Prototypal inheritance
 - Functional programming (closures, lambdas, functions as first-class citizens)
 - Garbage Collection

#### Red flags
 - No clue what any paradigms might be, no mention of functional or prototypal OO

### What are two-way data binding and one-way data flow, and how are they different?

Two-way data bindings means the UI is bound to model data such that changes to the UI updates the model and updates to the model updates the UI.  

In a one-way data flow the model is a source of truth.  Changes in the UI dispatch a message which updates the model.  The UI updates based on changes in the model.  

One-way data flows are deterministic whereas two-way bindings can cause side-effects which are harder to follow.

#### Good to hear
 - React as an example of one way data flows
 - Angular as an example of two way data bindings

#### Red Flags
 - Unable to explain the differences between two-way data bindings and one-way data flow.

### What is the difference between composition and inheritance?

Difference between *is-a* vs *has-a*, *can-do* and *uses-a*.

#### Good to hear
 - "Favor composition over inheritance"
 - Brittle class problems
 - Avoid rigid taxonomy

#### Red Flags
 - Fail to articulate the difference between composition and class inheritance, or the advantages of composition.

### How does async programming work in Javascript?

#### Good to hear
 - Callbacks
 - Promises
 - async/await

#### Red flags
 - Doesn't know how to do async in Javascript
 - No opinions on async models
