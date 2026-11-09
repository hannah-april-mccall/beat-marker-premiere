import copy
import json
from pathlib import Path
import sys
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'engine'))
from rhythm import recover

def song(times, meter=4):
    return {'duration':float(times[-1] + .3), 'activityStart':0., 'activityEnd':float(times[-1] + .3),
            'beats':[{'time':round(float(t),8), 'beat':i % meter + 1, 'bar':i // meter + 1} for i,t in enumerate(times)],
            'medianBpm':100., 'downbeatCount':len(times)//meter}

class RecoveryTests(unittest.TestCase):
    def test_recovers_sparse_intro_from_later_reference(self):
        raw=song(.12 + np.arange(180)*.6)
        raw['beats']=[{'time':t,'beat':1,'bar':i+1} for i,t in enumerate([.02,.8,9.46])]+raw['beats'][30:]
        untouched=copy.deepcopy(raw)
        out=recover(raw)
        self.assertTrue(out['postAnalysis']['applied'])
        self.assertEqual(out['postAnalysis']['beatsPerBar'],4)
        intro=[b for b in out['beats'] if b['time']<15]
        self.assertEqual(len(intro),25)
        self.assertTrue(all(b['inferred'] for b in intro))
        np.testing.assert_allclose([b['time'] for b in intro],.12+np.arange(25)*.6,atol=1e-6)
        self.assertEqual([b['beat'] for b in intro[:8]],[1,2,3,4,1,2,3,4])
        self.assertEqual(raw,untouched)
        self.assertEqual(out['detectedBeats'],raw['beats'])

    def test_preserves_good_detection_microtiming(self):
        raw=song(.12+np.arange(100)*.6)
        raw['beats'][40]['time']+=.015
        out=recover(raw)
        match=min(out['beats'],key=lambda b:abs(b['time']-raw['beats'][40]['time']))
        self.assertEqual(match['time'],raw['beats'][40]['time'])
        self.assertFalse(match['inferred'])

    def test_leading_and_trailing_silence_are_not_filled(self):
        raw=song(.12+np.arange(100)*.6)
        raw['activityStart']=3.;raw['activityEnd']=55.
        out=recover(raw)
        self.assertTrue(all(3<=b['time']<=55 for b in out['beats']))
        self.assertEqual(out['beats'][0]['beat'],2)
        self.assertEqual(out['beats'][0]['bar'],0)

    def test_variable_tempo_is_not_flattened(self):
        raw=song(np.cumsum(np.linspace(.38,.8,160)))
        out=recover(raw)
        self.assertFalse(out['postAnalysis']['applied'])
        self.assertEqual(out['beats'],raw['beats'])

    def test_real_half_tempo_change_is_not_auto_flattened(self):
        raw=song(np.r_[np.arange(80)*.6,48+np.arange(100)*.3])
        out=recover(raw)
        self.assertFalse(out['postAnalysis']['applied'])
        self.assertEqual(out['beats'],raw['beats'])

    def test_short_or_irregular_reference_is_retained(self):
        raw=song(np.array([0.,.6,8.,8.3,20.,31.]))
        self.assertEqual(recover(raw)['beats'],raw['beats'])

    def test_original_mode_is_an_exact_fallback(self):
        raw=song(.12+np.arange(100)*.6)
        out=recover(raw,'detected')
        self.assertEqual(out['beats'],raw['beats'])
        self.assertFalse(out['postAnalysis']['applied'])

    def test_triple_meter_comes_from_later_bar_starts(self):
        raw=song(.12+np.arange(120)*.4,3)
        out=recover(raw)
        self.assertEqual(out['postAnalysis']['beatsPerBar'],3)
        self.assertEqual([b['beat'] for b in out['beats'][:6]],[1,2,3,1,2,3])

    def test_no_downbeat_evidence_does_not_invent_bar_labels(self):
        raw=song(.12+np.arange(100)*.6)
        for b in raw['beats']:b['beat']=None;b['bar']=None
        out=recover(raw)
        self.assertTrue(out['postAnalysis']['applied'])
        self.assertTrue(all(b['beat'] is None for b in out['beats']))

    def test_saved_variable_tempo_recording_stays_unchanged(self):
        fixture=Path(__file__).resolve().parents[2]/'BeatMarker Tests/analyses/Classical - Hungarian Dance.json'
        if not fixture.exists():self.skipTest('Local music fixture not present.')
        raw=json.loads(fixture.read_text())
        self.assertEqual(recover(raw)['beats'],raw['beats'])

if __name__=='__main__':unittest.main()
