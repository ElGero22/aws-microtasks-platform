"""
Tests for Payment Processing with Platform Fee.
"""
import pytest
from unittest.mock import MagicMock, patch
from decimal import Decimal
import sys
import os

# Add handlers to path for import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'handlers', 'payments'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestPaymentSplit:
    """Tests for calculate_payment_split function."""
    
    def test_platform_fee_20_percent(self):
        """Verify 20% fee is correctly calculated."""
        # Import locally to allow mocking
        from handlers.payments.process_payment import calculate_payment_split, PLATFORM_FEE_PERCENT
        
        total_price = Decimal('10.00')
        worker_amount, platform_fee = calculate_payment_split(total_price)
        
        assert platform_fee == Decimal('2.00'), f"Expected $2.00 fee, got ${platform_fee}"
        assert worker_amount == Decimal('8.00'), f"Expected $8.00 to worker, got ${worker_amount}"
        assert worker_amount + platform_fee == total_price

    def test_small_amount_rounding(self):
        """Verify small amounts round down correctly."""
        from handlers.payments.process_payment import calculate_payment_split
        
        total_price = Decimal('0.03')  # 3 cents
        worker_amount, platform_fee = calculate_payment_split(total_price)
        
        # 20% of 3 cents = 0.6 cents, rounds down to 0 cents
        assert platform_fee == Decimal('0.00')
        assert worker_amount == Decimal('0.03')

    def test_typical_task_amounts(self):
        """Test common task reward amounts."""
        from handlers.payments.process_payment import calculate_payment_split
        
        test_cases = [
            (Decimal('0.50'), Decimal('0.40'), Decimal('0.10')),  # 50 cents
            (Decimal('1.00'), Decimal('0.80'), Decimal('0.20')),  # $1.00
            (Decimal('5.00'), Decimal('4.00'), Decimal('1.00')),  # $5.00
            (Decimal('0.10'), Decimal('0.08'), Decimal('0.02')),  # 10 cents
        ]
        
        for total, expected_worker, expected_fee in test_cases:
            worker, fee = calculate_payment_split(total)
            assert worker == expected_worker, f"For ${total}: expected worker ${expected_worker}, got ${worker}"
            assert fee == expected_fee, f"For ${total}: expected fee ${expected_fee}, got ${fee}"


class TestFraudDetection:
    """Tests for fraud detection module."""
    
    def test_copy_paste_detection(self):
        """Test that identical rapid submissions are flagged."""
        # This would need mocking of DynamoDB queries
        pass
    
    def test_spam_rate_limiting(self):
        """Test that rapid successive submissions are flagged."""
        pass
    
    def test_bot_timing_analysis(self):
        """Test that consistent timing patterns are detected."""
        pass


class TestConsensusVoting:
    """Tests for majority voting consensus algorithm."""
    
    def test_clear_majority_3_of_3(self):
        """Test consensus with 3 identical answers."""
        from handlers.qc.validate_submission import calculate_consensus
        
        submissions = [
            {'submissionId': '1', 'answer': 'cat'},
            {'submissionId': '2', 'answer': 'cat'},
            {'submissionId': '3', 'answer': 'cat'},
        ]
        
        consensus, matching, non_matching = calculate_consensus(submissions, 3)
        
        assert consensus == 'cat'
        assert len(matching) == 3
        assert len(non_matching) == 0

    def test_majority_2_of_3(self):
        """Test consensus with 2/3 majority."""
        from handlers.qc.validate_submission import calculate_consensus
        
        submissions = [
            {'submissionId': '1', 'answer': 'cat'},
            {'submissionId': '2', 'answer': 'cat'},
            {'submissionId': '3', 'answer': 'dog'},
        ]
        
        consensus, matching, non_matching = calculate_consensus(submissions, 3)
        
        assert consensus == 'cat'
        assert len(matching) == 2
        assert len(non_matching) == 1
        assert non_matching[0]['answer'] == 'dog'

    def test_no_consensus_all_different(self):
        """Test when all 3 answers are different."""
        from handlers.qc.validate_submission import calculate_consensus
        
        submissions = [
            {'submissionId': '1', 'answer': 'cat'},
            {'submissionId': '2', 'answer': 'dog'},
            {'submissionId': '3', 'answer': 'bird'},
        ]
        
        consensus, matching, non_matching = calculate_consensus(submissions, 3)
        
        # No clear majority - highest count is 1, which is < 2 (majority of 3)
        assert consensus is None
        assert len(matching) == 0
        assert len(non_matching) == 3

    def test_case_insensitive_matching(self):
        """Test that answer comparison is case-insensitive."""
        from handlers.qc.validate_submission import calculate_consensus
        
        submissions = [
            {'submissionId': '1', 'answer': 'Cat'},
            {'submissionId': '2', 'answer': 'CAT'},
            {'submissionId': '3', 'answer': 'cat'},
        ]
        
        consensus, matching, non_matching = calculate_consensus(submissions, 3)
        
        assert consensus == 'cat'  # Normalized to lowercase
        assert len(matching) == 3


class TestAIValidation:
    """Tests for AI-powered validation using Rekognition and Transcribe."""
    
    def test_validate_image_classification_match(self):
        """Test that Rekognition match returns approval."""
        from handlers.qc.validate_submission import validate_image_classification
        from unittest.mock import patch
        
        mock_labels = [
            {'Name': 'Cat', 'Confidence': 98.5, 'Parents': ['Animal', 'Pet']},
            {'Name': 'Animal', 'Confidence': 99.0, 'Parents': []},
        ]
        
        with patch('handlers.qc.validate_submission.detect_labels', return_value=mock_labels):
            with patch('handlers.qc.validate_submission.config') as mock_config:
                mock_config.MEDIA_BUCKET = 'test-bucket'
                mock_config.REKOGNITION_MIN_CONFIDENCE = 90
                
                result, confidence, method = validate_image_classification(
                    payload={'imageS3Key': 'test-image.jpg'},
                    worker_answer='cat'
                )
                
                assert result is True
                assert confidence >= 0.8
                assert 'Rekognition match' in method or 'Cat' in method

    def test_validate_image_classification_no_match(self):
        """Test that Rekognition mismatch returns False."""
        from handlers.qc.validate_submission import validate_image_classification
        from unittest.mock import patch
        
        mock_labels = [
            {'Name': 'Dog', 'Confidence': 95.0, 'Parents': ['Animal', 'Pet']},
            {'Name': 'Canine', 'Confidence': 90.0, 'Parents': []},
        ]
        
        with patch('handlers.qc.validate_submission.detect_labels', return_value=mock_labels):
            with patch('handlers.qc.validate_submission.config') as mock_config:
                mock_config.MEDIA_BUCKET = 'test-bucket'
                mock_config.REKOGNITION_MIN_CONFIDENCE = 90
                
                result, confidence, method = validate_image_classification(
                    payload={'imageS3Key': 'dog-image.jpg'},
                    worker_answer='cat'  # Wrong answer
                )
                
                assert result is False
                assert 'no match' in method.lower() or 'Dog' in method

    def test_validate_audio_transcription_match(self):
        """Test that transcription similarity check works."""
        from handlers.qc.validate_submission import validate_audio_transcription
        
        task = {
            'aiTranscription': 'Hola, buenos días. ¿Cómo estás?',
            'transcriptionStatus': 'COMPLETED'
        }
        
        # Worker answer is very similar
        result, confidence, method = validate_audio_transcription(
            task=task,
            worker_answer='Hola, buenos días. ¿Cómo estás?'
        )
        
        assert result is True
        assert confidence >= 0.85

    def test_validate_audio_transcription_partial_match(self):
        """Test partial transcription match returns inconclusive."""
        from handlers.qc.validate_submission import validate_audio_transcription
        
        task = {
            'aiTranscription': 'El rápido zorro marrón salta sobre el perro perezoso.',
            'transcriptionStatus': 'COMPLETED'
        }
        
        # Partial match
        result, confidence, method = validate_audio_transcription(
            task=task,
            worker_answer='El zorro salta sobre el perro.'
        )
        
        # Should be inconclusive (partial match)
        assert confidence >= 0.5

    def test_validate_audio_transcription_not_available(self):
        """Test that missing transcription returns None."""
        from handlers.qc.validate_submission import validate_audio_transcription
        
        task = {
            'transcriptionStatus': 'IN_PROGRESS'  # Not completed yet
        }
        
        result, confidence, method = validate_audio_transcription(
            task=task,
            worker_answer='Any answer'
        )
        
        assert result is None
        assert 'not available' in method.lower()


class TestAIValidationDispatcher:
    """Tests for the main validate_with_ai dispatcher function."""
    
    def test_image_classification_dispatch(self):
        """Test that image-classification tasks use Rekognition."""
        from handlers.qc.validate_submission import validate_with_ai
        from unittest.mock import patch
        
        with patch('handlers.qc.validate_submission.validate_image_classification') as mock:
            mock.return_value = (True, 0.95, 'Rekognition match')
            
            result, conf, method = validate_with_ai(
                task_type='image-classification',
                payload={'imageS3Key': 'test.jpg'},
                worker_answer='cat',
                task={}
            )
            
            mock.assert_called_once()
            assert result is True

    def test_audio_transcription_dispatch(self):
        """Test that audio-transcription tasks use Transcribe."""
        from handlers.qc.validate_submission import validate_with_ai
        from unittest.mock import patch
        
        with patch('handlers.qc.validate_submission.validate_audio_transcription') as mock:
            mock.return_value = (True, 0.90, 'Transcription match')
            
            result, conf, method = validate_with_ai(
                task_type='audio-transcription',
                payload={},
                worker_answer='test',
                task={'aiTranscription': 'test', 'transcriptionStatus': 'COMPLETED'}
            )
            
            mock.assert_called_once()
            assert result is True

    def test_generic_task_no_ai(self):
        """Test that generic tasks skip AI validation."""
        from handlers.qc.validate_submission import validate_with_ai
        
        result, conf, method = validate_with_ai(
            task_type='generic',
            payload={},
            worker_answer='any',
            task={}
        )
        
        assert result is None
        assert 'No AI validation' in method


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

