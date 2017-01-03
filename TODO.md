# TODO

## Common
- multi params for call & return array
- create d.ts file
- use parambulator in actions (validator.js, joi, ajv, validatorjs, validate.js make benchmark)
	```js
	add: {
		cache: true,
		params: {
			a: {type$:'number'},
			b: {type$:'number', gt$:0}
		},
		handler(ctx) {

		}
	}
	```

## Services
- service factory & context factory for broker options

## Transporters
- add gzip support

## Cachers
- add lru features t Memory and Redis

## Context
- wrap the whole calling to the context:
	ctx.invoke(handler) {
		retun Promise.resolve().
			.then(ctx => handler(ctx))
			.then(res => this.resolve(res))
			.catch(err => this.error(err));
	}