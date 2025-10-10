---
slug: "rdf-shacl-and-kuzu"
title: "Validating RDF data with SHACL in Kuzu"
description: "Combining RDFLib and SHACL to validate RDF data in Kuzu"
pubDate: "May 14 2024"
heroImage: "/blog/img/rdf-shacl-kuzu/rdf-running-example.png"
categories: ["example"]
authors: ["prashanth", {"name": "Paco Nathan", "image": "/blog/img/authors/paco-xander-nathan-e1713802414444-150x150.png", "bio": "Managing Partner at Derwen.ai"}]
tags: ["rdf", "shacl", "rdflib", "pyshacl"]
draft: false
---

The Resource Description Framework (RDF) model, along with property graphs, is one of the most popular
graph data models used in practice[^1]. In this post, we will explore how you can work with RDF data in Kuzu
using [RDFLib](https://rdflib.readthedocs.io/en/stable/) and [pySHACL](https://github.com/RDFLib/pySHACL).
We will demonstrate how to load this data into Kuzu, write SHACL shape constraints to validate the data,
and use Kuzu Explorer to visualize the resulting RDF graph.

## Basics of RDF

Our [earlier blog post](../in-praise-of-rdf) on RDF and Kuzu's [docs](https://kuzudb.github.io/docs/rdf-graphs/rdf-basics/)
provide a much more detailed explanation on RDF and when it is useful, but for the purposes
of this post, a brief summary of the terminology is provided in the table below:

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

## Scope and motivation for SHACL

RDF does not impose any logical restrictions on the domains and ranges of properties. For example,
a property may be applied to itself, or classes may contain themselves[^3]. Additionally, there are no
constraints on the cardinality of properties, or the data types of literals. This flexibility is a
double-edged sword -- while it allows the modeling of complex domains in the real world, it also
makes it easy to introduce errors in the data.

This fostered the development of the Shapes Constraint Language (SHACL), a W3C recommendation that
provides a way to impose structural constraints on RDF graphs.

The following is an excerpt from the [SHACL specification](https://www.w3.org/TR/shacl/) guide:

> The Shapes Constraint Language (SHACL) is a language for validating RDF graphs against a set of conditions. These conditions are provided as shapes and other constructs expressed in the form of an RDF graph. RDF graphs that are used in this manner are called "shapes graphs" in SHACL and the RDF graphs that are validated against a shapes graph are called "data graphs". As SHACL shape graphs are used to validate that data graphs satisfy a set of conditions they can also be viewed as a description of the data graphs that do satisfy these conditions.

Although the purpose of this post is to demonstrate how SHACL can be used to validate RDF data in Kuzu, SHACL also allows for a variety of other use cases
besides validation, such as user interface building and data integration[^4].

## Example

This section will walk you through a demonstration of how to load RDF data into Kuzu, validate it against SHACL shapes,
and visualize the RDF graph using Kuzu Explorer.

### Dataset

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
    kz:age 30.0 .

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
to one another. Note that `a` is shorthand for `rdf:type` in Turtle files, i.e., `kz:Adam a kz:student` is
equivalent to `kz:Adam rdf:type kz:student`.

Pictorially, this can be represented in RDF as follows:

![](/blog/img/rdf-shacl-kuzu/rdf-running-example.png)

`kz:Adam` is an alias for the IRI `http://kuzu.io/rdf-ex#Adam`, as specified in the prefix section at the top of the Turtle file. Each resource's properties are
represented as triples between the resource and literals. The relationships between resources are also represented as triples, such as `kz:Adam livesIn kz:Waterloo`.

### Load data into a Kuzu database

The following snippet shows how to ingest the RDF data into Kuzu. We first create an RDF graph
and then copy data from the Turtle file named `uni.ttl` into a local database directory named `db`.
We can specify the name of the RDF database in Kuzu as a constant, `UniKG`, so that it can be used
in the downstream Cypher queries.

```python
import pathlib
import kuzu

DB_PATH = "db"
DB_NAME = "UniKG"
db_path = pathlib.Path(DB_PATH)

# Populate Kuzu with the RDF data
db = kuzu.Database(DB_PATH)
conn = kuzu.Connection(db)

conn.execute(f"CREATE RDFGraph {DB_NAME}")
conn.execute(f"COPY {DB_NAME} FROM 'uni.ttl'")
```

### Register Kuzu in RDFLib plugins

[RDFLib](https://rdflib.readthedocs.io/en/stable/) is a well-known Python library that provides an API for querying RDF data,
allowing Python developers access to the entire W3C stack. It is extensible with plugins[^2], allowing
it to work with different storage backends. For this blog post,
we published an unofficial code repo that showcases how to use RDFLib with Kuzu as a backend.
The code can be found [here](https://github.com/DerwenAI/kuzu-rdflib).

To begin, we simply register the Kuzu plugin in RDFLib, instantiate an RDFLib `Graph` object that uses
Kuzu as the backend, and open the graph. To allow the user to specify which Kuzu database to use,
we pass the configuration data containing the database name and directory path as a mapping to the `open` method.

```python
import json
import rdflib

rdflib.plugin.register(
    "kuzudb",
    rdflib.store.Store,
    "graph",
    "PropertyGraph",
)

# Create an RDF graph instance
graph = rdflib.Graph(
    store = "kuzudb",
    identifier = "kuzudb",
)

# Populate the configuration data

config_data: str = json.dumps({
    "db_path": "db",
    "db_name": "UniKG",
})

# Open the RDF graph
graph.open(
    configuration = config_data,
    create = True,
)
```

Note that there needs to be a 1:1 correspondence between the instantiated `Graph`​ object in RDFlib
and a named KùzuDB database (in this case, `UniKg`). If you're creating a new RDF database in Kuzu, you
would need to reference that name instead in the `config_data` mapping for the RDFLib plugin.

Under the hood, a custom method called `get_graph()`​
is defined in [our demo code](https://github.com/DerwenAI/kuzu-rdflib/blob/main/graph.py) which
allows for direct access to the underlying Kuzu RDF graph. We encourage you to explore the code
in more detail and try the above workflow on your own data to understand how it works.

We can then interact with our graph in RDFLib by running a simple SPARQL query that retrieves all
triples from the RDF graph, outputting them as a Pandas DataFrame.

```python
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
3       http://kuzu.io/rdf-ex#Adam                        http://kuzu.io/rdf-ex#age                            30.0
4    http://kuzu.io/rdf-ex#Karissa                       http://kuzu.io/rdf-ex#name                         Karissa
5      http://kuzu.io/rdf-ex#Zhang                       http://kuzu.io/rdf-ex#name                           Zhang
6    http://kuzu.io/rdf-ex#Karissa                     http://kuzu.io/rdf-ex#bornIn  http://kuzu.io/rdf-ex#Waterloo
7       http://kuzu.io/rdf-ex#Adam                    http://kuzu.io/rdf-ex#livesIn  http://kuzu.io/rdf-ex#Waterloo
8   http://kuzu.io/rdf-ex#Waterloo  http://www.w3.org/1999/02/22-rdf-syntax-ns#type      http://kuzu.io/rdf-ex#City
9    http://kuzu.io/rdf-ex#faculty  http://www.w3.org/2000/01/rdf-schema#subClassOf    http://kuzu.io/rdf-ex#person
10   http://kuzu.io/rdf-ex#student  http://www.w3.org/2000/01/rdf-schema#subClassOf    http://kuzu.io/rdf-ex#person
11   http://kuzu.io/rdf-ex#Karissa  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#student
12      http://kuzu.io/rdf-ex#Adam  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#student
13     http://kuzu.io/rdf-ex#Zhang  http://www.w3.org/1999/02/22-rdf-syntax-ns#type   http://kuzu.io/rdf-ex#faculty
```

Note that in this case, although we specified a simple SPARQL query that captures all triples in the graph,
we could just as well have specified an arbitrary SPARQL query to the `graph.query()` method.
RDFLib comes with an implementation of the SPARQL 1.1 query language[^5], so you can pass more
complex queries with additional predicate filters, including prepared queries that can save
time in re-parsing and translating the query into SPARQL algebra each time the query is run[^5].

This means that you can actually query your Kuzu RDF graphs with SPARQL instead of Cypher using the Kuzu-RDFLib extension!
See the [section below](#query-the-rdf-graph-with-cypher) for an additional example.

### Specify SHACL shape constraints

Since the Kuzu-RDFLib plugin we implemented exposes an RDFLib `Graph` object, it can be used
with any other library that works with RDFLib graphs. In this example, we will show how to use the
[pySHACL](https://github.com/RDFLib/pySHACL) library, which validates RDFLib graphs against SHACL constraints.

To demonstrate how this works, consider a scenario where
we require that the `age` property of a `student` resource be an integer.
The SHACL shape constraint for this is shown below:

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix kz: <http://kuzu.io/rdf-ex#> .

kz:PersonShape
    a sh:NodeShape ;
    sh:targetClass kz:student ;
    sh:property [
        sh:path kz:age ;
        sh:datatype xsd:integer
    ] .
```

The above lines check that the `age` property of a `student` resource is of the type `xsd:integer`.

### Validate RDF data against SHACL shapes

Importing the `pySHACL` library allows us to validate the RDF data against SHACL shapes as follows:

```python
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

When the above lines are run, the validation fails because of a constraint violation -- the `age`
property of the student `Adam` was provided in the Turtle file as a float, not an integer.

```
Validation Report
Conforms: False
Results (1):
Constraint Violation in DatatypeConstraintComponent (http://www.w3.org/ns/shacl#DatatypeConstraintComponent):
        Severity: sh:Violation
        Source Shape: [ sh:datatype xsd:integer ; sh:path kz:age ]
        Focus Node: <http://kuzu.io/rdf-ex#Adam>
        Value Node: Literal("30.0", datatype=xsd:double)
        Result Path: kz:age
        Message: Value is not Literal with datatype xsd:integer
```

The violation can easily be fixed by setting the `age` property to an integer value (`30`) in the RDF data.

```
Validation Report
Conforms: True
```

The example shown above is simple enough for demonstration purposes, but SHACL shapes can be used to
define more complex constraints. For example, we could have also defined a constraint that allows
the `kz:person` target class to only be one of two subclasses -- `kz:student` and `kz:faculty` --
any other person class would be considered a violation in this university knowledge graph. The SHACL
[documentation](https://www.w3.org/TR/shacl/#shapes) provides a comprehensive list of constraints that can be defined.

To learn more about using SHACL in general, see the
[SHACL Wiki](https://kvistgaard.github.io/shacl/#/page/shacl%20wiki) project by
Veronika Heimsbakk and Ivo Velitchkov.

### Visualize the RDF graph in Kuzu Explorer

When building and validating RDF graphs, the ability to get visual feedback is quite useful. Kuzu
Explorer is a web-based interface that allows you to visualize RDF graphs and query them using Cypher (no knowledge of SPARQL required).
The instructions to launch Kuzu Explorer and connect to an existing database are shown in [the docs](https://kuzudb.github.io/docs/visualization/).

```bash
docker run -p 8000:8000 \
    -v /Users/prrao/code/kuzu-rdflib/db:/database \
    --rm kuzudb/explorer:latest
```

In a nutshell, Kuzu's [RDFGraphs extension](https://kuzudb.github.io/docs/rdf-graphs/) creates four distinct tables when the RDF data is loaded into the database:

- `UniKG_l`: A node table that contains literals
- `UniKG_r`: A node table that contains resources, where the primary key is the unique IRI
- `UniKG_lt`: A relationship table that contains resource-to-literal triples
- `UniKG_rt`: A relationship table that contains resource-to-resource triples

The following Cypher query can be run to visualize the entire graph:

```cypher
MATCH (s)-[p]->(o)
RETURN *;
```

![](/blog/img/rdf-shacl-kuzu/demo-rdf-viz.png)

As can be seen, the graph structure is identical to that shown earlier, in the pictorial representation.

The yellow edges represent resource-to-literal relationships (`UniKG_lt`), while the red edges represent
resource-to-resource relationships (`UniKG_rt`). We can inspect the schema of the RDF graph, including
each table's primary keys, visually, by clicking on the "Schema" tab in Kuzu Explorer.

![](/blog/img/rdf-shacl-kuzu/demo-rdf-schema.png)

### Query the RDF graph with Cypher

Recall that earlier, we showed how to query the RDF database using SPARQL in RDFLib. However, Kuzu also supports
querying RDF graphs using Cypher! In the example below, we run a query to only return students named "Karissa".

```cypher
// Run using Kuzu Explorer
WITH "http://kuzu.io/rdf-ex#" as kz
MATCH (s {iri: kz + "Karissa"})-[p1 {iri: kz + "name"}]->(l)
WHERE (s)-[p2]->(o {iri: kz + "student"})
RETURN DISTINCT s.iri, p1.iri, l.val;
```

### Query the RDF graph with SPARQL

The above Cypher query is functionally equivalent to this SPARQL query that can be run via RDFLib:

```sparql
# Run using RDFLib
PREFIX kz: <http://kuzu.io/rdf-ex#>
SELECT DISTINCT ?src ?name
WHERE {
    ?src a kz:student .
    ?src kz:name ?name .
    FILTER(?name = "Karissa")
}
```

Both queries would return the same result:

```
                        s.iri                       p1.iri  RDF_VARIANT
http://kuzu.io/rdf-ex#Karissa   http://kuzu.io/rdf-ex#name      Karissa
```

As can be seen, **you can choose the most appropriate query language** to analyze your data, depending on your
workflow and how you want to interface with the graph -- using SPARQL via RDFLib or Cypher via Kuzu.
Under the hood, Kuzu's query processor will use its native structured property
graph model to plan and optimize the query, so there are no negative performance implications when using Cypher.

You can also extend Kuzu's RDFGraphs with other property graphs, and query both your triples
*and* the other property graphs with a uniform query language, Cypher. See Kuzu's [documentation](https://kuzudb.github.io/docs/rdf-graphs/rdfgraphs-overview#querying-of-regular-node-and-relationship-tables-and-rdfgraphs) page for more information.

---

### Note on performance
When running SPARQL queries via RDFLib on top of a Kuzu backend, keep in mind that all the
RDF triples are pulled into memory, so this may not work well for larger graphs where the triples
do not fit in memory. However, in such cases, you could still query the RDF graph directly in Cypher
via Kuzu's [RDFGraphs](https://kuzudb.github.io/docs/rdf-graphs/rdfgraphs-overview/)
while also retaining query performance.

---

## Conclusions

In this post, we showed how RDF data in Turtle format can be easily loaded into Kuzu using RDFLib. This was
done by specifying Kuzu as a backend in the RDFLib plugin. We then demonstrated how SHACL shapes can be used to
validate the RDF data via the pySHACL library, allowing users to create data graphs in RDF that satisfy a set of conditions.
We also showed how Kuzu provides a simple and intuitive interface to load, query and visualize RDF graphs, without compromising
scalability and performance, because the RDF triples are essentially mapped to Kuzu's native property graph model.
Users can decide whether to query the graph via SPARQL (via RDFLib) or via Cypher (directly in Kuzu).

This is just the tip of the iceberg in terms of the pipelines you can build over
your Kuzu RDFGraphs with RDFLib integration. This post showed only how you get access to
two implementations of RDF standards in Python: SPARQL and SHACL. But there are other Python
libraries that integrate with RDFLib to implement other standards, such as [OWL](https://www.w3.org/OWL/) through the Python [OWL-RL](https://owl-rl.readthedocs.io/en/latest/)
library. OWL-RL can be used to do basic inheritance computations. 
Using the Kuzu plugin for RDFLib (see [here](https://github.com/DerwenAI/kuzu-rdflib)) in conjunction with these libraries,
you can build more complex pipelines and get access to the implementations of other RDF standards.
Check out the examples in Derwen.ai's [kglab](https://github.com/DerwenAI/kglab) library to see a variety of
other RDFLib plugins you get access to in Python.

We hope this post has provided a good starting point for you to explore RDF data models, SHACL, and how
to combine them using Kuzu as your graph backend. Feel free to go through our RDFGraphs [documentation](https://kuzudb.github.io/docs/rdf-graphs/)
to learn more!

## Code

See [this repo](https://github.com/DerwenAI/kuzu-rdflib?tab=readme-ov-file) for the code required to reproduce the examples shown.
Many thanks to [Paco Nathan](https://github.com/ceteri) @ Derwen.ai for his contributions to the code and writing of this post.

---

[^1]: If you're new to RDF, it's highly recommended that you read our past blog post "[In praise of RDF](../in-praise-of-rdf)" in its
entirety.
[^2]: RDFLib [documentation on plugins](https://rdflib.readthedocs.io/en/stable/plugin_stores.html).
[^3]: W3C Recommendation 10 February 2004, [RDF Semantics](https://www.w3.org/TR/rdf-mt/)
[^4]: W3C Working Group Note 20 July 2017, [SHACL use cases and requirements](https://www.w3.org/TR/shacl-ucr/)
[^5]: Querying with SPARQL, [RDFLib docs](https://rdflib.readthedocs.io/en/stable/intro_to_sparql.html)
