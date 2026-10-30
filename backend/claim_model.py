"""Small inference runtime for the trained pipeline's exported parameters."""
import json
import math
import struct
from pathlib import Path


class ClaimModel:
    def __init__(self, path):
        self.parameters = json.loads(Path(path).read_text())

    def predict_proba(self, records):
        model = self.parameters
        output = []
        for record in records:
            vector = [float(record[field] == category) for field, categories in model['categories'] for category in categories]
            vector += [(float(record[field]) - mean) / scale for field, mean, scale in model['numeric']]
            if model['kind'] == 'forest':
                # sklearn forests compare float32 inputs against their stored thresholds.
                vector = [struct.unpack('f', struct.pack('f', value))[0] for value in vector]
                total = 0.0
                for tree in model['trees']:
                    node = 0
                    while tree['left'][node] != -1:
                        node = tree['left'][node] if vector[tree['feature'][node]] <= tree['threshold'][node] else tree['right'][node]
                    total += tree['positive'][node]
                score = total / len(model['trees'])
            else:
                value = model['intercept'] + sum(a * b for a, b in zip(vector, model['coefficients']))
                score = 1 / (1 + math.exp(-value)) if value >= 0 else math.exp(value) / (1 + math.exp(value))
            output.append([1 - score, score])
        return output
