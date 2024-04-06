---
slug: "rdf-shacl-and-kuzu"
title: "Validating RDF data with SHACL in Kùzu"
description: "Combining RDFLib and SHACL to validate RDF data in Kùzu"
pubDate: "April 05 2024"
heroImage: "/img/rdf-shacl-kuzu/rdf-running-example.png"
categories: ["example"]
authors: ["prashanth", {"name": "Paco Nathan", "image": https://avatars.githubusercontent.com/u/57973?v=4", "bio": "Managing Partner at Derwen.ai"}]
tags: ["rdf", "shacl", "rdflib"]
---

The Resource Description Framework (RDF) model, along with property graphs, is one of the most common
graph data models used in practice. In this post, we will explore how you can work with RDF data in Kùzu
using [RDFLib](https://rdflib.readthedocs.io/en/stable/) and [pySHACL](https://github.com/RDFLib/pySHACL).
We will demonstrate how to load this data into Kùzu, write SHACL shape constraints to validate the data,
and use Kùzu Explorer to visualize the resulting RDF graph.

## Basics of RDF

RDF is a simple and flexible data model[^1], where the data and schema are defined in the form of `<subject, predicate, object>`
triples. A collection of these triples forms a knowledge graph. Due to the standards around RDF, such as RDFS and OWL, it is also a
*knowledge representation system* that gives clear meaning to certain vocabulary in triples, especially the predicates/verbs. RDF has its historical roots in
Semantic Web, which itself has roots in good old-fashioned symbolic AI/knowledge representation and reasoning (KRR).

The main pros of RDF are: (i) modeling complex, irregular domains; (ii) seamless schema and data querying; (iii) data integration
without transformations; and (iv) automatic logical inference/reasoning[^2]. On the other hand, the main cons of building large RDF databases
are: (i) performance and scalability; (ii) verbosity; and (iii) inherent challenges of modeling complex domains, such as ensuring
logical consistency in the database.

Kùzu's [docs](https://docs.kuzudb.com/rdf-graphs/rdf-basics/) and our earlier blog post[^1] on RDF provide a much more detailed explanation on
the terminology and where RDF graphs are useful, but for the purposes of this post, a brief summary is provided in the table below:

| Term | Description |
| --- | --- |
| RDF triple | A statement or fact with three components: `<subject, predicate, object>` |
| RDF graph | A set of RDF triples |
| Resource | A thing in the world (e.g., an abstract concept), synonymous with "entity" |
| IRI | **I**nternationalized **R**esource **I**dentifier: A global identifier for resources, specified as a unicode string |
| Literal | A value that represents a string, number, or date |
| RDFS (RDF Schema) | Data-modeling vocabulary for RDF data |
| OWL (Web Ontology Language) | Computational logic-based language to represent complex knowledge about things, groups of things, and the relations between them |
| Turtle | A human-readable serialization format for RDF data expressing OWL or RDF schemas |

RDF Schema (RDFS) and OWL are part of larger set of standards to model knowledge, and contain a standardized vocabulary
to describe the structure of RDF graphs. Some examples are shown below:

- `rdf:type` is used to state that a resource is an instance of a class
- `rdfs:subClassOf` is used to form class hierarchies
- `owl:sameAs` is used to identify that two resources are the same

## What is SHACL?

The following is an excerpt from the [SHACL specification](https://www.w3.org/TR/shacl/) guide:

> The Shapes Constraint Language (SHACL) is a language for validating RDF graphs against a set of conditions. These conditions are provided as shapes and other constructs expressed in the form of an RDF graph. RDF graphs that are used in this manner are called "shapes graphs" in SHACL and the RDF graphs that are validated against a shapes graph are called "data graphs". As SHACL shape graphs are used to validate that data graphs satisfy a set of conditions they can also be viewed as a description of the data graphs that do satisfy these conditions.

Although it may seem at first glance that the sole purpose of SHACL is to perform validation, its descriptions may be used for a variety of other purposes, including user interface building, code generation and data integration.

In the example below, we will use the `RDFLib` library in Python to load RDF data into Kùzu, and `pySHACL` to validate the data against a set of SHACL shapes. We will then use Kùzu Explorer to visualize the resulting RDF graph.

## Dataset

Consider the following RDF data, which represents a simple knowledge graph about students, faculty members, locations, and their relationships:

```turtle
@prefix kz: <http://kuzu.io/rdf-ex#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

kz:Waterloo a kz:City ;
        kz:name "Waterloo"@en ;
        kz:population 150000 .

kz:Adam a kz:student ;
    kz:livesIn kz:Waterloo ;
    kz:name "Adam" ;
    kz:age  30 .

kz:student rdfs:subClassOf kz:person .

kz:Karissa a kz:student ;
       kz:bornIn kz:Waterloo ;
       kz:name "Karissa" .

kz:Zhang a kz:faculty ;
     kz:name "Zhang" .

kz:faculty rdfs:subClassOf kz:person .
```

The data represents an RDF graph with schema information about two students, Adam and Karissa,
a faculty member named Zhang, and a city named Waterloo. It also specifies how these resources are related
to one another. Note that `a` is just shorthand for `rdf:type` in the Turtle file, i.e., `kz:Adam a kz:student`
means the same as `kz:Adam rdf:type kz:student`.

Conceptually, this can be represented in RDF as follows:

![](/img/rdf-shacl-kuzu/rdf-running-example.png)

`kz:Adam` is an alias for the IRI `http://kuzu.io/rdf-ex#Adam`, as specified in the prefix section at the top of the Turtle file. Each resource's properties are
represented as triples between the resource and literals. The relationships between resources are also represented as triples, such as `kz:Adam livesIn kz:Waterloo`.

## Load data into a Kùzu database

The following snippet shows how to ingest the RDF data into Kùzu. We first create an RDF graph
and then copy data from the Turtle file named `uni.ttl` into a local database directory named `db`.

```py
from pathlib import Path
import kuzu

DB_DIR = "db"
db_path = Path(DB_DIR)
# Populate Kùzu with the RDF data
db = kuzu.Database(DB_DIR)
conn = kuzu.Connection(db)

conn.execute("CREATE RDFGraph UniKG")
conn.execute("COPY UniKG FROM 'uni.ttl'")
```

## Register Kùzu in RDFLib plugins

[RDFLib](https://rdflib.readthedocs.io/en/stable/) is a Python library that provides a simple API for querying RDF data. It is extensible with plugins[^3], allowing it to work with
different storage backends. In this case, we simply register the Kùzu plugin in RDFLib. For databases like Kùzu that offer on-disk persistence,
the graph needs to first be opened before we can query it.

```py
import rdflib

rdflib.plugin.register(
    "kuzudb",
    rdflib.store.Store,
    "graph",
    "PropertyGraph",
)
# Create an RDF graph instance
graph = rdflib.Graph(store="kuzudb", identifier="kuzudb")
# Open the RDF graph
graph.open(configuration="db", create=True)
```

We can then run a simple SPARQL query via RDFLib to retrieve all triples from the RDF graph.

```py
import pandas as pd

query = """
    SELECT ?src ?rel ?dst
    WHERE {
        ?src ?rel ?dst .
    }
"""
# Export query results to a Pandas DataFrame
df = pd.DataFrame([r.asdict() for r in graph.query(query)])
```

The following result is obtained:

```
                                src                                              rel                             dst
0   http://kuzu.io/rdf-ex#Waterloo                       http://kuzu.io/rdf-ex#name                        Waterloo
1   http://kuzu.io/rdf-ex#Waterloo                 http://kuzu.io/rdf-ex#population                          150000
2       http://kuzu.io/rdf-ex#Adam                       http://kuzu.io/rdf-ex#name                            Adam
3       http://kuzu.io/rdf-ex#Adam                        http://kuzu.io/rdf-ex#age                              30
4    http://kuzu.io/rdf-ex#Karissa                       http://kuzu.io/rdf-ex#name                         Karissa
5      http://kuzu.io/rdf-ex#Zhang                       http://kuzu.io/rdf-ex#name                           Zhang
6    http://kuzu.io/rdf-ex#Karissa                     http://kuzu.io/rdf-ex#bornIn  http://kuzu.io/rdf-ex#Waterloo
7       http://kuzu.io/rdf-ex#Adam                    http://kuzu.io/rdf-ex#livesIn  http://kuzu.io/rdf-ex#Waterloo
8   http://kuzu.io/rdf-ex#Waterloo  http://www.w3.org/1999/02/22-rdf-syntax-ns#type      http://kuzu.io/rdf-ex#City
9    http://kuzu.io/rdf-ex#Karissa  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#student
10      http://kuzu.io/rdf-ex#Adam  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#student
11   http://kuzu.io/rdf-ex#faculty  http://www.w3.org/2000/01/rdf-schema#subClassOf    http://kuzu.io/rdf-ex#person
12   http://kuzu.io/rdf-ex#student  http://www.w3.org/2000/01/rdf-schema#subClassOf    http://kuzu.io/rdf-ex#person
13     http://kuzu.io/rdf-ex#Zhang  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#faculty
```

## Specify SHACL shape constraints

SHACL allows us to define constraints on the RDF graph. To demonstrate how this works, consider this rather strict
constraint:

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix kz: <http://kuzu.io/rdf-ex#> .

kz:PersonShape
    a sh:NodeShape ;
    sh:targetClass kz:student ;
    sh:property [
        sh:path kz:name ;
        sh:minLength 5
    ] .
```

The above lines check that the `name` property of a `student` resource has a minimum length of 5 characters.

## Validate RDF data against SHACL shapes

We can use the `pySHACL` library to validate the RDF data against SHACL shapes. The shape constraint
from above is read into Python code and used to validate the RDF graph.

```py
import pyshacl
# `shapes_graph` is the SHACL constraint from above specified in Turtle format

results = pyshacl.validate(
    graph,
    shacl_graph = shapes_graph,
    data_graph_format = "json-ld",
    shacl_graph_format = "ttl",
    inplace = False,
    serialize_report_graph = "ttl",
    debug = False,
)
```

Sure enough, the validation fails in this case because in our data, the name of the student `Adam`
has only 4 characters. The validation report is output so that we can see the constraint violation.

```turtle
Validation Report
Conforms: False
Results (1):
Constraint Violation in MinLengthConstraintComponent (http://www.w3.org/ns/shacl#MinLengthConstraintComponent):
        Severity: sh:Violation
        Source Shape: [ sh:minLength Literal("5", datatype=xsd:integer) ; sh:path kz:name ]
        Focus Node: <http://kuzu.io/rdf-ex#Adam>
        Value Node: Literal("Adam")
        Result Path: kz:name
        Message: String length not >= Literal("5", datatype=xsd:integer)
```

The violation can easily be fixed by setting the minimum length of the `name` property to a smaller value, such as 2.
When this is done, the validation passes.

```turtle
Validation Report
Conforms: True
```

## Visualize the RDF graph in Kùzu Explorer

When building and validating RDF graphs, the ability to get visual feedback is quite useful. Kùzu
Explorer is a web-based interface that allows you to visualize RDF graphs and query them using Cypher (no knowledge of SPARQL required).
The instructions to launch Kùzu Explorer and connect to an existing database are shown in [the docs](https://docs.kuzudb.com/visualization/).

```bash
docker run -p 8000:8000 \
    -v /Users/prrao/code/kuzu-rdflib/db:/database \
    --rm kuzudb/explorer:latest
```

In a nutshell, Kùzu's RDFGraphs extension creates four distinct tables when the RDF data is loaded into the database:

- `UniKG_l`: A node table that contains literals
- `UniKG_r`: A node table that contains resources, where the primary key is the unique IRI
- `UniKG_lt`: A relationship table that contains resource-to-literal triples
- `UniKG_rt`: A relationship table that contains resource-to-resource triples

The following Cypher query can be run to visualize the entire graph:

```cypher
MATCH (s)-[p]->(o)
RETURN *;
```

![](/img/rdf-shacl-kuzu/demo-rdf-viz.png)

As can be seen, the graph structure is identical to that shown earlier, in the conceptual representation.

The yellow edges represent resource-to-literal relationships (`UniKG_lt`), while the red edges represent
resource-to-resource relationships (`UniKG_rt`). We can inspect the schema of the RDF graph, including
each table's primary keys, visually, by clicking on the "Schema" tab in Kùzu Explorer.

![](/img/rdf-shacl-kuzu/demo-rdf-schema.png)

## Querying the RDF graph with Cypher

Further Cypher queries can be run on the RDF graph, that perform the same operations as their SPARQL equivalents.
In the example below, we want to run a query to only return students named "Karissa".

```cypher
// Run using Kùzu Explorer
WITH "http://kuzu.io/rdf-ex#" as kz
MATCH (s {iri: kz + "Karissa"})-[p1 {iri: kz + "name"}]->(l)
WHERE (s)-[p2]->(o {iri: kz + "student"})
RETURN DISTINCT s.iri, p1.iri, l.val;
```

The above query is functionally equivalent to this SPARQL query that can be run in RDFLib:

```sparql
# Run using RDFLib
PREFIX kz: <http://kuzu.io/rdf-ex#>
SELECT DISTINCT ?src ?name
WHERE {
  ?src a kz:student .
  ?src kz:name ?name .
```

Both queries would return the following result:

```
                        s.iri                       p1.iri  RDF_VARIANT
http://kuzu.io/rdf-ex#Karissa   http://kuzu.io/rdf-ex#name      Karissa
```

As can be seen, you can choose the most appropriate query language to analyze your data, depending on your
workflow and how you want to interface with the graph -- using SPARQL via RDFLib or Cypher via Kùzu.
Under the hood, Kùzu's query processor will use its native structured property
graph model to plan and optimize the query, so there are no negative performance implications when using Cypher.

## Conclusions

In this post, we showed how RDF data in Turtle format can be easily loaded into Kùzu using RDFLib. This was
done by specifying Kùzu as a backend in the RDFLib plugin. We then demonstrated how SHACL shapes can be used to
validate the RDF data, allowing users to create data graphs in RDF that satisfy a set of conditions.
Kùzu provides a simple and intuitive interface to load, query and visualize RDF graphs, without compromising
scalability and performance, because the RDF triples are essentially mapped to into Kùzu's native property graph model.

Taking this further, users can expand on the demonstrated workflow by creating more complex
RDF data models in their domains, define more intricate SHACL shapes, and apply more advanced functionality
in RDFLib. OWL-RL is a brute-force implementation of OWL 2 RDF-based semantics, available in in RDFLib[^4],
allowing users to perform reasoning over RDF graphs.

We hope this post has provided a good starting point for users to explore RDF data models, SHACL, and how
their combination can be leveraged to build a variety of applications powered by Kùzu! Go through our
RDFGraphs [documentation](https://docs.kuzudb.com/rdf-graphs/) to learn more about the capabilities of Kùzu with RDF data.

## Code

See [this repo](https://github.com/DerwenAI/kuzu-rdflib?tab=readme-ov-file) for the code required to reproduce the examples shown.
Many thanks to [Paco Nathan](https://github.com/ceteri) @ Derwen.ai for his contributions to the code and writing of this post.

---

[^1]: If you're new to RDF, it's highly recommended that you read our past blog post "[In praise of RDF](../in-praise-of-rdf)" in its
entirety.
[^2]: Automatic logical inference and reasoning over RDF graphs are currently not supported in Kùzu.
[^3]: RDFLib [documentation on plugins](https://rdflib.readthedocs.io/en/stable/plugin_stores.html).
[^4]: OWL-RL [technical documentation](https://owl-rl.readthedocs.io/en/latest/owlrl.html) for RDFLib.